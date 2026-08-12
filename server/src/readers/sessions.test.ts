import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openLedgerDb, type LedgerDb } from '../ledger/db.js'
import { getSession, listSessions } from './sessions.js'

const COST_MAIN_SONNET = (1000 * 3 + 500 * 15) / 1e6
const COST_AGENT_SONNET = (200 * 3 + 100 * 15) / 1e6

let configRoot: string
let workdir: string
let workdirKey: string
let db: LedgerDb

beforeEach(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'sessions-config-'))
  workdir = mkdtempSync(join(tmpdir(), 'sessions-work-'))
  workdirKey = workdir.replace(/\\/g, '/') // Registry keys use forward slashes

  mkdirSync(join(configRoot, 'sessions'))
  writeFileSync(
    join(configRoot, 'sessions', '42.json'),
    JSON.stringify({ pid: 42, sessionId: 'sess-live', cwd: workdir, status: 'busy' })
  )

  db = openLedgerDb(':memory:')
  const insertSession = db.prepare(
    'INSERT INTO sessions (session_id, cwd, title, first_ts, last_ts, transcript_path, transcript_gone) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  // Lowercased backslash cwd — the canonical join must still match the forward-slash filter.
  insertSession.run('sess-live', workdir.toLowerCase(), 'Live fixture session',
    '2026-08-10T10:00:00.000Z', '2026-08-10T11:30:00.000Z', join(workdir, 'x.jsonl'), 0)
  insertSession.run('sess-gone', workdir, 'GC fixture session',
    '2026-06-01T09:00:00.000Z', '2026-06-01T09:05:00.000Z', null, 1)
  insertSession.run('sess-other', 'D:\\somewhere\\else', 'Other project session',
    '2026-08-09T08:00:00.000Z', '2026-08-09T08:10:00.000Z', null, 0)
  insertSession.run('sess-nocwd', null, null, null, null, null, 0)

  db.prepare('INSERT INTO agent_runs (agent_id, session_id, agent_type, description) VALUES (?, ?, ?, ?)').run(
    'agent-1', 'sess-live', 'Explore', 'search the repo'
  )
  const insertTurn = db.prepare(
    'INSERT INTO turns (session_id, uuid, ts, model, agent_id, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  insertTurn.run('sess-live', 't-1', '2026-08-10T10:00:00.000Z', 'claude-sonnet-4-6', null, 1000, 500)
  insertTurn.run('sess-live', 't-2', '2026-08-10T10:30:00.000Z', 'mystery-model-9', null, 100, 50)
  insertTurn.run('sess-live', 't-a', '2026-08-10T11:00:00.000Z', 'claude-sonnet-4-6', 'agent-1', 200, 100)
  insertTurn.run('sess-gone', 't-3', '2026-06-01T09:01:00.000Z', 'claude-sonnet-4-6', null, 10, 20)
  insertTurn.run('sess-other', 't-4', '2026-08-09T08:05:00.000Z', 'claude-sonnet-4-6', null, 7, 7)
})

afterEach(() => {
  db.close()
  rmSync(configRoot, { recursive: true, force: true })
  rmSync(workdir, { recursive: true, force: true })
})

describe('listSessions', () => {
  it('lists all Ledger Sessions newest first, enriched with liveness and project name', () => {
    const res = listSessions(configRoot, db)
    expect(res.total).toBe(4)
    expect(res.liveCount).toBe(1)
    expect(res.ledgerOnlyCount).toBe(1)
    expect(res.sessions.map((s) => s.sessionId)).toEqual(['sess-live', 'sess-other', 'sess-gone', 'sess-nocwd'])

    const live = res.sessions[0]
    expect(live.title).toBe('Live fixture session')
    expect(live.projectName).toBe(lastSegment(workdir).toLowerCase()) // derived from the cwd as the Ledger stored it
    expect(live.live).toBe(true)
    expect(live.transcriptGone).toBe(false)
    expect(live.durationMs).toBe(90 * 60_000)
    expect(live.agentRuns).toBe(1)
    expect(live.turns).toBe(3) // the Agent Run's Turn rolls up
    expect(live.tokens).toBe(1950)
    expect(live.costUsd).toBeCloseTo(COST_MAIN_SONNET + COST_AGENT_SONNET, 10)
    expect(live.unpricedTurns).toBe(1)
    expect(live.models.toSorted()).toEqual(['claude-sonnet-4-6', 'mystery-model-9'])

    const gone = res.sessions[2]
    expect(gone.live).toBe(false)
    expect(gone.transcriptGone).toBe(true)
    expect(gone.tokens).toBe(30)
  })

  it('keeps a Session with no cwd and no Turns as a zeroed row', () => {
    const nocwd = listSessions(configRoot, db).sessions[3]
    expect(nocwd.projectName).toBeNull()
    expect(nocwd.durationMs).toBeNull()
    expect(nocwd.turns).toBe(0)
    expect(nocwd.costUsd).toBeNull()
    expect(nocwd.models).toEqual([])
  })

  it('filters by cwd through the canonical join', () => {
    const res = listSessions(configRoot, db, { cwd: workdirKey })
    expect(res.total).toBe(2)
    expect(res.sessions.map((s) => s.sessionId)).toEqual(['sess-live', 'sess-gone'])
  })

  it('caps the rows at limit but keeps the full counts', () => {
    const res = listSessions(configRoot, db, { limit: 1 })
    expect(res.total).toBe(4)
    expect(res.sessions).toHaveLength(1)
    expect(res.sessions[0].sessionId).toBe('sess-live')
  })

  it('degrades to an empty list when the Ledger is unavailable', () => {
    expect(listSessions(configRoot, null)).toEqual({ total: 0, liveCount: 0, ledgerOnlyCount: 0, sessions: [] })
  })
})

describe('getSession', () => {
  it('returns the row plus per-model breakdown and Agent Run rollups', () => {
    const detail = getSession(configRoot, db, 'sess-live')!
    expect(detail.session.sessionId).toBe('sess-live')
    expect(detail.session.live).toBe(true)

    expect(detail.models).toHaveLength(2)
    const [sonnet, mystery] = detail.models // highest cost first
    expect(sonnet.model).toBe('claude-sonnet-4-6')
    expect(sonnet.turns).toBe(2)
    expect(sonnet.tokens).toBe(1800)
    expect(sonnet.costUsd).toBeCloseTo(COST_MAIN_SONNET + COST_AGENT_SONNET, 10)
    expect(mystery.model).toBe('mystery-model-9')
    expect(mystery.costUsd).toBeNull()
    expect(mystery.unpricedTurns).toBe(1)

    expect(detail.agentRuns).toEqual([
      {
        agentId: 'agent-1',
        agentType: 'Explore',
        description: 'search the repo',
        turns: 1,
        tokens: 300,
        costUsd: COST_AGENT_SONNET,
        unpricedTurns: 0
      }
    ])
  })

  it('returns null for an unknown id or an unavailable Ledger', () => {
    expect(getSession(configRoot, db, 'no-such-session')).toBeNull()
    expect(getSession(configRoot, null, 'sess-live')).toBeNull()
  })
})

function lastSegment(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p
}
