import { beforeEach, describe, expect, it } from 'vitest'
import { openLedgerDb, type LedgerDb } from '../ledger/db.js'
import {
  finishRun, getRun, insertRun, latestOkContextHash, listRuns, markCancelled, markRunning, runStatus
} from './store.js'

let db: LedgerDb

beforeEach(() => {
  db = openLedgerDb(':memory:')
})

function insert(runId: string, contextHash = 'hash-a') {
  insertRun(db, { runId, objectType: 'model', objectKey: 'claude-fable-5', model: 'haiku', contextHash })
}

const OK_OUTCOME = {
  status: 'ok' as const,
  costUsd: 0.0123,
  rawResult: JSON.stringify({ summary: 'Looks fine.', recommendations: [] }),
  recommendations: [
    { severity: 'warning' as const, finding: 'F1', action: 'A1' },
    { severity: 'info' as const, finding: 'F2', action: 'A2' }
  ]
}

describe('advisor store', () => {
  it('walks the queued → running → ok lifecycle and persists Recommendations', () => {
    insert('run-1')
    expect(runStatus(db, 'run-1')).toBe('queued')
    markRunning(db, 'run-1')
    expect(runStatus(db, 'run-1')).toBe('running')
    finishRun(db, 'run-1', OK_OUTCOME)

    const run = getRun(db, 'run-1')!
    expect(run.status).toBe('ok')
    expect(run.finishedAt).not.toBeNull()
    expect(run.costUsd).toBe(0.0123)
    expect(run.summary).toBe('Looks fine.')
    expect(run.recommendations).toEqual(OK_OUTCOME.recommendations)
  })

  it('persists error and timeout outcomes without Recommendations', () => {
    insert('run-err')
    markRunning(db, 'run-err')
    finishRun(db, 'run-err', { status: 'error', error: 'claude exited 1' })
    expect(getRun(db, 'run-err')).toMatchObject({ status: 'error', error: 'claude exited 1', recommendations: [] })

    insert('run-to')
    markRunning(db, 'run-to')
    finishRun(db, 'run-to', { status: 'timeout' })
    expect(getRun(db, 'run-to')).toMatchObject({ status: 'timeout', error: null })
  })

  it('never lets a finished child overwrite a cancel that raced it', () => {
    insert('run-c')
    markRunning(db, 'run-c')
    expect(markCancelled(db, 'run-c')).toBe(true)
    finishRun(db, 'run-c', OK_OUTCOME) // the killed child still resolved
    expect(getRun(db, 'run-c')).toMatchObject({ status: 'cancelled', recommendations: [] })
    expect(markCancelled(db, 'run-c')).toBe(false) // already terminal
  })

  it('lists an object history newest first and finds the latest ok context hash', () => {
    insert('run-old', 'hash-old')
    finishRun(db, 'run-old', OK_OUTCOME)
    insert('run-new', 'hash-new')
    finishRun(db, 'run-new', { status: 'error', error: 'boom' })

    const runs = listRuns(db, 'model', 'claude-fable-5')
    expect(runs.map((run) => run.runId)).toEqual(['run-new', 'run-old'])
    // The latest *ok* run carries the comparator hash, not the newest run overall.
    expect(latestOkContextHash(db, 'model', 'claude-fable-5')).toBe('hash-old')
    expect(latestOkContextHash(db, 'model', 'other-model')).toBeNull()
    expect(listRuns(db, 'plugin', 'claude-fable-5')).toEqual([])
  })

  it('returns null for an unknown run', () => {
    expect(getRun(db, 'nope')).toBeNull()
    expect(runStatus(db, 'nope')).toBeNull()
  })
})
