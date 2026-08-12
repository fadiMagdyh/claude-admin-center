import { appendFileSync, cpSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openLedgerDb, type LedgerDb } from './db.js'
import { sweep } from './ingest.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'ledger-config-root')
const SESSION_A = 'aaaa1111-1111-1111-1111-111111111111'
const SESSION_B = 'bbbb2222-2222-2222-2222-222222222222'

let configRoot: string
let sessionBPath: string
let db: LedgerDb

beforeEach(() => {
  // Copy the fixture config root so tests can append to / delete transcripts.
  configRoot = mkdtempSync(join(tmpdir(), 'ledger-test-'))
  cpSync(fixtureRoot, configRoot, { recursive: true })
  sessionBPath = join(configRoot, 'projects', 'D--fixture-app', `${SESSION_B}.jsonl`)
  db = openLedgerDb(':memory:')
})

afterEach(() => {
  db.close()
  rmSync(configRoot, { recursive: true, force: true })
})

function count(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

describe('sweep', () => {
  it('ingests main and subagent transcripts into the four tables', () => {
    const result = sweep(db, configRoot)

    expect(result.filesSeen).toBe(3)
    expect(result.filesRead).toBe(3)
    expect(result.newTurns).toBe(5) // t-a1, t-a2, t-a4, t-s1, t-b1 — t-a3 has no usage
    expect(count('turns')).toBe(5)
    expect(count('sessions')).toBe(2)
    expect(count('agent_runs')).toBe(1)
    expect(count('ingest_files')).toBe(3)

    const sessionA = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(SESSION_A) as Record<string, unknown>
    expect(sessionA.title).toBe('Fixture session A') // latest ai-title wins
    expect(sessionA.cwd).toBe('D:\\fixture\\app')
    expect(sessionA.first_ts).toBe('2026-08-01T10:00:00.000Z')
    expect(sessionA.last_ts).toBe('2026-08-01T10:03:00.000Z') // includes the subagent record
    expect(sessionA.transcript_path).toContain(`${SESSION_A}.jsonl`)
    expect(sessionA.transcript_gone).toBe(0)
  })

  it('stores an aggregate-only cache write in the 5m bucket with cache_untiered=1', () => {
    sweep(db, configRoot)
    const untiered = db.prepare('SELECT * FROM turns WHERE uuid = ?').get('t-a2') as Record<string, unknown>
    expect(untiered.cache_write_5m).toBe(1000)
    expect(untiered.cache_write_1h).toBe(0)
    expect(untiered.cache_untiered).toBe(1)

    const tiered = db.prepare('SELECT * FROM turns WHERE uuid = ?').get('t-a1') as Record<string, unknown>
    expect(tiered.cache_write_5m).toBe(2000)
    expect(tiered.cache_write_1h).toBe(3000)
    expect(tiered.cache_untiered).toBe(0)
  })

  it('lands subagent Turns under the parent session with their agent_id', () => {
    sweep(db, configRoot)
    const agentTurn = db.prepare('SELECT * FROM turns WHERE uuid = ?').get('t-s1') as Record<string, unknown>
    expect(agentTurn.session_id).toBe(SESSION_A)
    expect(agentTurn.agent_id).toBe('fix1')

    const agentRun = db.prepare('SELECT * FROM agent_runs WHERE agent_id = ?').get('fix1') as Record<string, unknown>
    expect(agentRun).toMatchObject({ session_id: SESSION_A, agent_type: 'Explore', description: 'Fixture explore run' })

    const mainTurn = db.prepare('SELECT agent_id FROM turns WHERE uuid = ?').get('t-a1') as { agent_id: string | null }
    expect(mainTurn.agent_id).toBeNull()
  })

  it('re-sweeps idempotently: unchanged files are skipped, counts stay put', () => {
    sweep(db, configRoot)
    const second = sweep(db, configRoot)

    expect(second.filesSeen).toBe(3)
    expect(second.filesRead).toBe(0)
    expect(second.newTurns).toBe(0)
    expect(count('turns')).toBe(5)
    expect(count('sessions')).toBe(2)
    expect(count('agent_runs')).toBe(1)
  })

  it('resumes a grown file from its stored byte offset', () => {
    sweep(db, configRoot)
    appendFileSync(sessionBPath, `${JSON.stringify({
      type: 'assistant', uuid: 't-b2', sessionId: SESSION_B, timestamp: '2026-08-02T09:05:00.000Z',
      cwd: 'D:\\fixture\\app', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 7, output_tokens: 3 } }
    })}\n`)

    const result = sweep(db, configRoot)
    expect(result.filesRead).toBe(1) // only the grown file
    expect(result.newTurns).toBe(1)
    expect(count('turns')).toBe(6)

    const sessionB = db.prepare('SELECT last_ts FROM sessions WHERE session_id = ?').get(SESSION_B) as { last_ts: string }
    expect(sessionB.last_ts).toBe('2026-08-02T09:05:00.000Z')
  })

  it('leaves a partially-written last line for the next sweep', () => {
    sweep(db, configRoot)
    const record = `${JSON.stringify({
      type: 'assistant', uuid: 't-b3', sessionId: SESSION_B, timestamp: '2026-08-02T09:06:00.000Z',
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1, output_tokens: 1 } }
    })}\n`
    const splitAt = 40 // mid-record: not valid JSON on its own

    appendFileSync(sessionBPath, record.slice(0, splitAt))
    const partial = sweep(db, configRoot)
    expect(partial.newTurns).toBe(0)

    appendFileSync(sessionBPath, record.slice(splitAt))
    const completed = sweep(db, configRoot)
    expect(completed.newTurns).toBe(1)
    expect(count('turns')).toBe(6)
    expect(db.prepare('SELECT COUNT(*) AS n FROM turns WHERE uuid = ?').get('t-b3')).toEqual({ n: 1 })
  })

  it('flags sessions whose transcript vanished without deleting their rows', () => {
    sweep(db, configRoot)
    unlinkSync(sessionBPath)

    sweep(db, configRoot)
    const gone = db.prepare('SELECT transcript_gone FROM sessions WHERE session_id = ?').get(SESSION_B) as { transcript_gone: number }
    expect(gone.transcript_gone).toBe(1)
    const kept = db.prepare('SELECT transcript_gone FROM sessions WHERE session_id = ?').get(SESSION_A) as { transcript_gone: number }
    expect(kept.transcript_gone).toBe(0)
    expect(count('turns')).toBe(5) // Session B's Turns survive GC
  })
})
