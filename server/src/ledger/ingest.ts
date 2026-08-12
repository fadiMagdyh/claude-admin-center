import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import type { LedgerDb } from './db.js'

export type SweepResult = {
  /** Transcript files found under projects/. */
  filesSeen: number
  /** Files actually read (new, grown, or changed). */
  filesRead: number
  /** Turns inserted this Sweep. */
  newTurns: number
  durationMs: number
}

/**
 * One incremental ingest pass over projects/**\/*.jsonl (main + subagent
 * transcripts). Consults ingest_files to skip unchanged files and resume grown
 * ones from their stored byte offset; INSERT OR IGNORE on (session_id, uuid)
 * makes re-sweeping idempotent. Read-only towards the config root.
 */
export function sweep(db: LedgerDb, configRoot: string): SweepResult {
  const startedAt = Date.now()
  const stmts = prepareStatements(db)
  const result: SweepResult = { filesSeen: 0, filesRead: 0, newTurns: 0, durationMs: 0 }

  for (const file of listTranscriptFiles(join(configRoot, 'projects'))) {
    result.filesSeen++
    try {
      const newTurns = ingestFile(db, stmts, file)
      if (newTurns === null) continue // unchanged since last Sweep
      result.filesRead++
      result.newTurns += newTurns
    } catch (error) {
      console.error(`Ledger sweep: failed to ingest ${file.path}`, error)
    }
  }

  flagGoneTranscripts(db)
  result.durationMs = Date.now() - startedAt
  return result
}

/**
 * Watch the projects tree and trigger a debounced (~2s) incremental Sweep on
 * every transcript change. Returns the watcher so the caller can close it.
 */
export function watch(db: LedgerDb, configRoot: string, onSweep?: (result: SweepResult) => void): FSWatcher {
  const watcher = chokidarWatch(join(configRoot, 'projects'), { ignoreInitial: true })
  let timer: NodeJS.Timeout | null = null

  const scheduleSweep = (filePath: string) => {
    if (!filePath.endsWith('.jsonl') && !filePath.endsWith('.meta.json')) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onSweep?.(sweep(db, configRoot))
    }, 2000)
  }

  watcher.on('add', scheduleSweep).on('change', scheduleSweep).on('unlink', scheduleSweep)
  return watcher
}

type TranscriptFile = {
  path: string
  /** From agent-<id>.jsonl under a subagents/ dir; null = main transcript. */
  agentId: string | null
}

function listTranscriptFiles(projectsDir: string, files: TranscriptFile[] = []): TranscriptFile[] {
  let entries
  try {
    entries = readdirSync(projectsDir, { withFileTypes: true })
  } catch {
    return files // projects dir missing or unreadable — nothing to sweep
  }
  for (const entry of entries) {
    const entryPath = join(projectsDir, entry.name)
    if (entry.isDirectory()) {
      listTranscriptFiles(entryPath, files)
    } else if (entry.name.endsWith('.jsonl')) {
      const agentMatch = basename(dirname(entryPath)) === 'subagents' && entry.name.match(/^agent-(.+)\.jsonl$/)
      files.push({ path: entryPath, agentId: agentMatch ? agentMatch[1] : null })
    }
  }
  return files
}

type Statements = ReturnType<typeof prepareStatements>

function prepareStatements(db: LedgerDb) {
  return {
    getIngestFile: db.prepare('SELECT size, mtime_ms, byte_offset FROM ingest_files WHERE path = ?'),
    setIngestFile: db.prepare(`
      INSERT INTO ingest_files (path, size, mtime_ms, byte_offset) VALUES (?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime_ms = excluded.mtime_ms, byte_offset = excluded.byte_offset`),
    insertTurn: db.prepare(`
      INSERT OR IGNORE INTO turns (
        session_id, uuid, ts, model, agent_id,
        input_tokens, output_tokens, cache_write_5m, cache_write_1h, cache_read, cache_untiered,
        web_search_requests, web_fetch_requests, attribution_skill, attribution_plugin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    upsertSession: db.prepare(`
      INSERT INTO sessions (session_id, cwd, title, first_ts, last_ts, transcript_path, transcript_gone)
      VALUES (?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(session_id) DO UPDATE SET
        cwd = COALESCE(excluded.cwd, cwd),
        title = COALESCE(excluded.title, title),
        first_ts = MIN(COALESCE(first_ts, excluded.first_ts), COALESCE(excluded.first_ts, first_ts)),
        last_ts = MAX(COALESCE(last_ts, excluded.last_ts), COALESCE(excluded.last_ts, last_ts)),
        transcript_path = COALESCE(excluded.transcript_path, transcript_path)`),
    upsertAgentRun: db.prepare(`
      INSERT INTO agent_runs (agent_id, session_id, agent_type, description) VALUES (?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        session_id = excluded.session_id,
        agent_type = COALESCE(excluded.agent_type, agent_type),
        description = COALESCE(excluded.description, description)`)
  }
}

/** The slice of a transcript record the Ledger reads. */
type TranscriptRecord = {
  type?: string
  uuid?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  aiTitle?: string
  attributionSkill?: string
  attributionPlugin?: string
  message?: {
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
      cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
      server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number }
    }
  }
}

/** Ingest one transcript file's unseen bytes; returns the number of new Turns, or null if unchanged. */
function ingestFile(db: LedgerDb, stmts: Statements, file: TranscriptFile): number | null {
  const stat = statSync(file.path)
  const size = stat.size
  const mtimeMs = Math.trunc(stat.mtimeMs)
  const known = stmts.getIngestFile.get(file.path) as { size: number; mtime_ms: number; byte_offset: number } | undefined

  if (known && known.size === size && known.mtime_ms === mtimeMs) return null
  // Grown append-only file → resume from the stored offset; shrunk or rewritten → full re-parse.
  const startOffset = known && size > known.size ? known.byte_offset : 0

  const chunk = readBytesFrom(file.path, startOffset)
  const { records, consumedBytes } = parseNdjsonChunk(chunk)

  const ingestChunk = db.transaction(() => {
    let newTurns = 0
    const sessions = new Map<string, { cwd: string | null; title: string | null; firstTs: string | null; lastTs: string | null }>()

    for (const record of records as TranscriptRecord[]) {
      if (!record.sessionId) continue
      let session = sessions.get(record.sessionId)
      if (!session) {
        session = { cwd: null, title: null, firstTs: null, lastTs: null }
        sessions.set(record.sessionId, session)
      }
      if (record.cwd) session.cwd = record.cwd
      if (record.type === 'ai-title' && record.aiTitle) session.title = record.aiTitle // latest in file order wins
      if (record.timestamp) {
        if (!session.firstTs || record.timestamp < session.firstTs) session.firstTs = record.timestamp
        if (!session.lastTs || record.timestamp > session.lastTs) session.lastTs = record.timestamp
      }
      if (record.type === 'assistant') newTurns += insertTurn(stmts, record, file.agentId)
    }

    for (const [sessionId, session] of sessions) {
      // A subagent file's records carry the parent sessionId; only the main transcript owns transcript_path.
      stmts.upsertSession.run(sessionId, session.cwd, session.title, session.firstTs, session.lastTs,
        file.agentId === null ? file.path : null)
      if (file.agentId !== null) {
        const meta = readAgentMeta(file.path)
        stmts.upsertAgentRun.run(file.agentId, sessionId, meta.agentType, meta.description)
      }
    }

    stmts.setIngestFile.run(file.path, size, mtimeMs, startOffset + consumedBytes)
    return newTurns
  })
  return ingestChunk()
}

/** Insert one assistant usage record as a Turn; returns 1 if it was new. Records without usage are skipped. */
function insertTurn(stmts: Statements, record: TranscriptRecord, agentId: string | null): number {
  const usage = record.message?.usage
  if (!usage || !record.uuid || !record.timestamp || !record.message?.model) return 0

  let cacheWrite5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0
  let cacheWrite1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  let cacheUntiered = 0
  if (!usage.cache_creation && (usage.cache_creation_input_tokens ?? 0) > 0) {
    // Old record without the per-TTL breakdown: keep the aggregate in the 5m bucket, flagged approximate.
    cacheWrite5m = usage.cache_creation_input_tokens!
    cacheUntiered = 1
  }

  const inserted = stmts.insertTurn.run(
    record.sessionId, record.uuid, record.timestamp, record.message.model, agentId,
    usage.input_tokens ?? 0, usage.output_tokens ?? 0, cacheWrite5m, cacheWrite1h,
    usage.cache_read_input_tokens ?? 0, cacheUntiered,
    usage.server_tool_use?.web_search_requests ?? 0, usage.server_tool_use?.web_fetch_requests ?? 0,
    record.attributionSkill ?? null, record.attributionPlugin ?? null
  )
  return inserted.changes
}

function readAgentMeta(agentJsonlPath: string): { agentType: string | null; description: string | null } {
  try {
    const meta = JSON.parse(readFileSync(agentJsonlPath.replace(/\.jsonl$/, '.meta.json'), 'utf8'))
    return { agentType: meta.agentType ?? null, description: meta.description ?? null }
  } catch {
    return { agentType: null, description: null }
  }
}

function readBytesFrom(filePath: string, offset: number): Buffer {
  const fd = openSync(filePath, 'r')
  try {
    const length = Math.max(0, fstatSync(fd).size - offset)
    const buffer = Buffer.alloc(length)
    let bytesRead = 0
    while (bytesRead < length) {
      const n = readSync(fd, buffer, bytesRead, length - bytesRead, offset + bytesRead)
      if (n === 0) break
      bytesRead += n
    }
    return buffer.subarray(0, bytesRead)
  } finally {
    closeSync(fd)
  }
}

/**
 * Parse NDJSON, tolerating a partially-written last line: consumedBytes only
 * advances past newline-terminated lines (plus an unterminated tail if it
 * already parses as complete JSON), so the next Sweep re-reads the remainder.
 */
function parseNdjsonChunk(chunk: Buffer): { records: unknown[]; consumedBytes: number } {
  const records: unknown[] = []
  let consumedBytes = 0
  let lineStart = 0
  while (lineStart < chunk.length) {
    const newlineAt = chunk.indexOf(0x0a, lineStart)
    const line = chunk.subarray(lineStart, newlineAt === -1 ? chunk.length : newlineAt).toString('utf8').trim()
    if (newlineAt === -1) {
      try {
        if (line) records.push(JSON.parse(line))
        consumedBytes = chunk.length
      } catch {
        // partial last line — leave it for the next Sweep
      }
      break
    }
    if (line) {
      try {
        records.push(JSON.parse(line))
      } catch {
        // malformed but complete line — skip it and move on
      }
    }
    consumedBytes = newlineAt + 1
    lineStart = newlineAt + 1
  }
  return { records, consumedBytes }
}

/** Flag sessions whose main transcript no longer exists (transcripts are GC'd); rows are never deleted. */
function flagGoneTranscripts(db: LedgerDb): void {
  const rows = db.prepare('SELECT session_id, transcript_path, transcript_gone FROM sessions WHERE transcript_path IS NOT NULL')
    .all() as Array<{ session_id: string; transcript_path: string; transcript_gone: number }>
  const setGone = db.prepare('UPDATE sessions SET transcript_gone = ? WHERE session_id = ?')
  for (const row of rows) {
    const gone = existsSync(row.transcript_path) ? 0 : 1
    if (gone !== row.transcript_gone) setGone.run(gone, row.session_id)
  }
}
