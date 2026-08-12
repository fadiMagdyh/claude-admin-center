import type { SessionDetailResponse, SessionRow, SessionsResponse } from 'shared'
import type { LedgerDb } from '../ledger/db.js'
import {
  agentRunStats, listSessionStats, sessionModelTotals, sessionStats, totalTokens, type SessionListStats
} from '../ledger/queries.js'
import { readLiveSessions } from './liveSessions.js'

const DEFAULT_LIMIT = 100

/**
 * All Ledger Sessions, newest activity first, enriched with liveness from the
 * live-session registry (Read Rule: stats from the Ledger, liveness live).
 * Optionally filtered to one project cwd and capped at `limit` rows. Pass
 * db=null when the Ledger is unavailable — the list degrades to empty.
 */
export function listSessions(
  configRoot: string,
  db: LedgerDb | null,
  options: { cwd?: string; limit?: number } = {}
): SessionsResponse {
  const all = db ? listSessionStats(db, options.cwd) : []
  const liveIds = liveSessionIds(configRoot)
  return {
    total: all.length,
    liveCount: all.filter((s) => liveIds.has(s.sessionId)).length,
    ledgerOnlyCount: all.filter((s) => s.transcriptGone).length,
    sessions: all.slice(0, options.limit ?? DEFAULT_LIMIT).map((s) => toSessionRow(s, liveIds))
  }
}

/**
 * One Session's detail: its list row plus the per-model breakdown and its
 * Agent Runs' rollups. Null when the Ledger is unavailable or the id is unknown.
 */
export function getSession(configRoot: string, db: LedgerDb | null, sessionId: string): SessionDetailResponse | null {
  if (!db) return null
  const stats = sessionStats(db, sessionId)
  if (!stats) return null
  const models = sessionModelTotals(db, sessionId)
  return {
    session: toSessionRow({ ...stats, models: models.map((m) => m.model) }, liveSessionIds(configRoot)),
    models: models.map((m) => ({
      model: m.model,
      turns: m.turns,
      tokens: totalTokens(m),
      costUsd: m.costUsd,
      unpricedTurns: m.unpricedTurns
    })),
    agentRuns: agentRunStats(db, sessionId).map((run) => ({
      agentId: run.agentId,
      agentType: run.agentType,
      description: run.description,
      turns: run.turns,
      tokens: totalTokens(run),
      costUsd: run.costUsd,
      unpricedTurns: run.unpricedTurns
    }))
  }
}

function toSessionRow(stats: SessionListStats, liveIds: Set<string>): SessionRow {
  return {
    sessionId: stats.sessionId,
    title: stats.title,
    projectName: stats.cwd ? lastPathSegment(stats.cwd) : null,
    cwd: stats.cwd,
    live: liveIds.has(stats.sessionId),
    transcriptGone: stats.transcriptGone,
    firstTs: stats.firstTs,
    lastTs: stats.lastTs,
    durationMs: stats.firstTs && stats.lastTs ? Date.parse(stats.lastTs) - Date.parse(stats.firstTs) : null,
    agentRuns: stats.agentRuns,
    turns: stats.turns,
    tokens: totalTokens(stats),
    costUsd: stats.costUsd,
    unpricedTurns: stats.unpricedTurns,
    models: stats.models
  }
}

function liveSessionIds(configRoot: string): Set<string> {
  return new Set(readLiveSessions(configRoot).map((s) => s.sessionId))
}

function lastPathSegment(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p
}
