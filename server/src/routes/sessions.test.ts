import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionDetailResponse, SessionsResponse } from 'shared'
import { ledgerDb } from '../ledger/db.js'
import { app } from '../app.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'config-root')
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalLedgerDbPath = process.env.LEDGER_DB_PATH

beforeAll(() => {
  process.env.CLAUDE_CONFIG_DIR = fixtureRoot
  process.env.LEDGER_DB_PATH = ':memory:'
  seedLedger()
})
afterAll(() => {
  process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  if (originalLedgerDbPath === undefined) delete process.env.LEDGER_DB_PATH
  else process.env.LEDGER_DB_PATH = originalLedgerDbPath
})

/** Seed the shared in-memory Ledger the routes will read. */
function seedLedger() {
  const db = ledgerDb()
  const insertSession = db.prepare(
    'INSERT INTO sessions (session_id, cwd, title, first_ts, last_ts, transcript_path, transcript_gone) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  // Matches the fixture live registry (sessions/111.json: sessionId live-beta-session).
  insertSession.run('live-beta-session', 'D:\\fixture\\beta', 'Beta live session',
    '2026-08-10T10:00:00.000Z', '2026-08-10T10:20:00.000Z', 'D:\\somewhere\\live-beta-session.jsonl', 0)
  insertSession.run('gone-alpha-session', 'D:/fixture/alpha', 'Alpha GC session',
    '2026-07-01T09:00:00.000Z', '2026-07-01T09:30:00.000Z', null, 1)

  db.prepare('INSERT INTO agent_runs (agent_id, session_id, agent_type, description) VALUES (?, ?, ?, ?)').run(
    'agent-9', 'live-beta-session', 'Explore', 'fixture agent run'
  )
  const insertTurn = db.prepare(
    'INSERT INTO turns (session_id, uuid, ts, model, agent_id, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  insertTurn.run('live-beta-session', 't-1', '2026-08-10T10:00:00.000Z', 'claude-sonnet-4-6', null, 1000, 500)
  insertTurn.run('live-beta-session', 't-2', '2026-08-10T10:10:00.000Z', 'claude-sonnet-4-6', 'agent-9', 200, 100)
  insertTurn.run('gone-alpha-session', 't-3', '2026-07-01T09:10:00.000Z', 'claude-sonnet-4-6', null, 10, 20)
}

describe('GET /api/sessions', () => {
  it('lists Ledger Sessions newest first with liveness and ledger-only counts', async () => {
    const res = await app.request('/api/sessions')
    expect(res.status).toBe(200)
    const body = (await res.json()) as SessionsResponse

    expect(body.total).toBe(2)
    expect(body.liveCount).toBe(1)
    expect(body.ledgerOnlyCount).toBe(1)
    expect(body.sessions.map((s) => s.sessionId)).toEqual(['live-beta-session', 'gone-alpha-session'])

    const live = body.sessions[0]
    expect(live.projectName).toBe('beta')
    expect(live.live).toBe(true)
    expect(live.agentRuns).toBe(1)
    expect(live.turns).toBe(2)
    expect(live.tokens).toBe(1800)
    expect(live.durationMs).toBe(20 * 60_000)
    expect(live.models).toEqual(['claude-sonnet-4-6'])

    expect(body.sessions[1].transcriptGone).toBe(true)
  })

  it('filters by cwd and caps rows at limit', async () => {
    const filtered = (await (await app.request(`/api/sessions?cwd=${encodeURIComponent('D:/fixture/alpha')}`)).json()) as SessionsResponse
    expect(filtered.total).toBe(1)
    expect(filtered.sessions[0].sessionId).toBe('gone-alpha-session')

    const limited = (await (await app.request('/api/sessions?limit=1')).json()) as SessionsResponse
    expect(limited.total).toBe(2)
    expect(limited.sessions).toHaveLength(1)

    expect((await app.request('/api/sessions?limit=0')).status).toBe(400)
    expect((await app.request('/api/sessions?limit=abc')).status).toBe(400)
  })
})

describe('GET /api/sessions/detail', () => {
  it('returns the Session with per-model breakdown and Agent Run rollups', async () => {
    const res = await app.request('/api/sessions/detail?id=live-beta-session')
    expect(res.status).toBe(200)
    const body = (await res.json()) as SessionDetailResponse

    expect(body.session.sessionId).toBe('live-beta-session')
    expect(body.session.live).toBe(true)
    expect(body.models).toHaveLength(1)
    expect(body.models[0].model).toBe('claude-sonnet-4-6')
    expect(body.models[0].turns).toBe(2)
    expect(body.agentRuns).toHaveLength(1)
    expect(body.agentRuns[0]).toMatchObject({ agentId: 'agent-9', agentType: 'Explore', turns: 1, tokens: 300 })
  })

  it('rejects a missing id param and an unknown id', async () => {
    expect((await app.request('/api/sessions/detail')).status).toBe(400)
    expect((await app.request('/api/sessions/detail?id=no-such-session')).status).toBe(404)
  })
})
