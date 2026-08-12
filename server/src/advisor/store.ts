import type { AdvisorObjectType, AdvisorRun, AdvisorRunModel, AdvisorRunStatus, Recommendation } from 'shared'
import type { LedgerDb } from '../ledger/db.js'

/** An AdvisorRun as stored, keeping the context_hash the API responses omit. */
export type StoredRun = AdvisorRun & { contextHash: string }

type RunRow = {
  run_id: string
  object_type: string
  object_key: string
  model: string
  status: string
  requested_at: string
  finished_at: string | null
  cost_usd: number | null
  error: string | null
  context_hash: string
  raw_result: string | null
}

const RUN_COLUMNS =
  'run_id, object_type, object_key, model, status, requested_at, finished_at, cost_usd, error, context_hash, raw_result'

export function insertRun(
  db: LedgerDb,
  run: { runId: string; objectType: AdvisorObjectType; objectKey: string; model: AdvisorRunModel; contextHash: string }
): void {
  db.prepare(
    `INSERT INTO advisor_runs (run_id, object_type, object_key, model, status, requested_at, context_hash)
     VALUES (?, ?, ?, ?, 'queued', ?, ?)`
  ).run(run.runId, run.objectType, run.objectKey, run.model, new Date().toISOString(), run.contextHash)
}

export function markRunning(db: LedgerDb, runId: string): void {
  db.prepare(`UPDATE advisor_runs SET status = 'running' WHERE run_id = ? AND status = 'queued'`).run(runId)
}

/** Cancel a queued or running run; false when it already reached a terminal status. */
export function markCancelled(db: LedgerDb, runId: string): boolean {
  const result = db
    .prepare(
      `UPDATE advisor_runs SET status = 'cancelled', finished_at = ?
       WHERE run_id = ? AND status IN ('queued', 'running')`
    )
    .run(new Date().toISOString(), runId)
  return result.changes > 0
}

export type RunOutcome =
  | { status: 'ok'; costUsd: number | null; rawResult: string; recommendations: Recommendation[] }
  | { status: 'error'; error: string }
  | { status: 'timeout' }

/**
 * Persist a finished run and its Recommendations. Guarded on queued/running so
 * a cancel that raced the child's death is never overwritten.
 */
export function finishRun(db: LedgerDb, runId: string, outcome: RunOutcome): void {
  const finish = db.transaction(() => {
    const updated = db
      .prepare(
        `UPDATE advisor_runs SET status = ?, finished_at = ?, cost_usd = ?, error = ?, raw_result = ?
         WHERE run_id = ? AND status IN ('queued', 'running')`
      )
      .run(
        outcome.status,
        new Date().toISOString(),
        outcome.status === 'ok' ? outcome.costUsd : null,
        outcome.status === 'error' ? outcome.error : null,
        outcome.status === 'ok' ? outcome.rawResult : null,
        runId
      )
    if (updated.changes === 0 || outcome.status !== 'ok') return
    const insert = db.prepare('INSERT INTO recommendations (run_id, severity, finding, action) VALUES (?, ?, ?, ?)')
    for (const rec of outcome.recommendations) insert.run(runId, rec.severity, rec.finding, rec.action)
  })
  finish()
}

export function runStatus(db: LedgerDb, runId: string): AdvisorRunStatus | null {
  const row = db.prepare('SELECT status FROM advisor_runs WHERE run_id = ?').get(runId) as
    | { status: AdvisorRunStatus }
    | undefined
  return row?.status ?? null
}

export function getRun(db: LedgerDb, runId: string): StoredRun | null {
  const row = db.prepare(`SELECT ${RUN_COLUMNS} FROM advisor_runs WHERE run_id = ?`).get(runId) as RunRow | undefined
  return row ? toStoredRun(db, row) : null
}

/** All runs for one object, newest first — the object's history. */
export function listRuns(db: LedgerDb, objectType: AdvisorObjectType, objectKey: string): StoredRun[] {
  const rows = db
    .prepare(
      `SELECT ${RUN_COLUMNS} FROM advisor_runs WHERE object_type = ? AND object_key = ?
       ORDER BY requested_at DESC, rowid DESC`
    )
    .all(objectType, objectKey) as RunRow[]
  return rows.map((row) => toStoredRun(db, row))
}

/** "Input unchanged" = the latest ok run's context_hash equals the hash assembled right now. */
export function latestOkContextHash(db: LedgerDb, objectType: AdvisorObjectType, objectKey: string): string | null {
  const row = db
    .prepare(
      `SELECT context_hash FROM advisor_runs WHERE object_type = ? AND object_key = ? AND status = 'ok'
       ORDER BY requested_at DESC, rowid DESC LIMIT 1`
    )
    .get(objectType, objectKey) as { context_hash: string } | undefined
  return row?.context_hash ?? null
}

function toStoredRun(db: LedgerDb, row: RunRow): StoredRun {
  const recommendations =
    row.status === 'ok'
      ? (db
          .prepare('SELECT severity, finding, action FROM recommendations WHERE run_id = ? ORDER BY id')
          .all(row.run_id) as Recommendation[])
      : []
  return {
    runId: row.run_id,
    objectType: row.object_type as AdvisorRun['objectType'],
    objectKey: row.object_key,
    model: row.model as AdvisorRun['model'],
    status: row.status as AdvisorRun['status'],
    requestedAt: row.requested_at,
    finishedAt: row.finished_at,
    costUsd: row.cost_usd,
    error: row.error,
    summary: extractSummary(row.raw_result),
    recommendations,
    contextHash: row.context_hash
  }
}

/** The summary lives inside raw_result (the run's structured output) — no extra column needed. */
function extractSummary(rawResult: string | null): string | null {
  if (!rawResult) return null
  try {
    const parsed = JSON.parse(rawResult) as { summary?: unknown }
    return typeof parsed.summary === 'string' ? parsed.summary : null
  } catch {
    return null
  }
}
