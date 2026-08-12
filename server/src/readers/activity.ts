import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ActivityEntry, ActivityResponse } from 'shared'

const DEFAULT_LIMIT = 100

/**
 * The Activity feed: submitted prompts from <configRoot>/history.jsonl,
 * newest first — a live read per the Read Rule. Malformed lines are skipped.
 * Project paths are forward-slash normalized to match Registry keys.
 * Optionally filtered to one project cwd and capped at `limit` entries.
 */
export function listActivity(
  configRoot: string,
  options: { limit?: number; project?: string } = {}
): ActivityResponse {
  let raw: string
  try {
    raw = readFileSync(join(configRoot, 'history.jsonl'), 'utf8')
  } catch {
    return { total: 0, entries: [] }
  }

  const entries: ActivityEntry[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const entry = parseHistoryLine(line)
    if (entry) entries.push(entry)
  }
  entries.reverse() // the file is append-only chronological → newest first

  const matching = options.project ? entries.filter((e) => e.project === options.project) : entries
  return { total: matching.length, entries: matching.slice(0, options.limit ?? DEFAULT_LIMIT) }
}

/** One history.jsonl line → an entry; null for malformed JSON or missing required fields. */
function parseHistoryLine(line: string): ActivityEntry | null {
  let record: { display?: unknown; timestamp?: unknown; project?: unknown; sessionId?: unknown }
  try {
    record = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof record.display !== 'string' || typeof record.timestamp !== 'number') return null
  const project = typeof record.project === 'string' ? record.project.replace(/\\/g, '/') : ''
  return {
    display: record.display,
    timestamp: record.timestamp,
    project,
    projectName: project.split('/').filter(Boolean).at(-1) ?? '',
    sessionId: typeof record.sessionId === 'string' ? record.sessionId : null
  }
}
