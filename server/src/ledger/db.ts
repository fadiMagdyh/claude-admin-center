import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

export type LedgerDb = Database.Database

/** The server package directory (parent of src/ and dist/), independent of cwd. */
const serverPackageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * The locked four-table schema from issue #7. Turns are the storage grain;
 * (session_id, uuid) is a global dedup key, so INSERT OR IGNORE makes every
 * Sweep idempotent. Rows are never deleted — sessions whose transcript was
 * garbage-collected are only flagged transcript_gone.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id      TEXT PRIMARY KEY,
  cwd             TEXT,
  title           TEXT,
  first_ts        TEXT,
  last_ts         TEXT,
  transcript_path TEXT,
  transcript_gone INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_runs (
  agent_id    TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  agent_type  TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  session_id          TEXT NOT NULL,
  uuid                TEXT NOT NULL,
  ts                  TEXT NOT NULL,
  model               TEXT NOT NULL,
  agent_id            TEXT,                       -- NULL = main transcript
  input_tokens        INTEGER NOT NULL DEFAULT 0, -- uncached remainder only
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  cache_write_5m      INTEGER NOT NULL DEFAULT 0,
  cache_write_1h      INTEGER NOT NULL DEFAULT 0,
  cache_read          INTEGER NOT NULL DEFAULT 0,
  cache_untiered      INTEGER NOT NULL DEFAULT 0, -- old aggregate-only record: total stored in cache_write_5m
  web_search_requests INTEGER NOT NULL DEFAULT 0,
  web_fetch_requests  INTEGER NOT NULL DEFAULT 0,
  attribution_skill   TEXT,
  attribution_plugin  TEXT,
  PRIMARY KEY (session_id, uuid)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS turns_ts ON turns (ts);

CREATE TABLE IF NOT EXISTS ingest_files (
  path        TEXT PRIMARY KEY,
  size        INTEGER NOT NULL,
  mtime_ms    INTEGER NOT NULL,
  byte_offset INTEGER NOT NULL
);
`

export function defaultLedgerDbPath(): string {
  return process.env.LEDGER_DB_PATH || join(serverPackageDir, 'data', 'ledger.db')
}

/** Open a Ledger DB, creating schema and parent dir as needed. Tests pass ':memory:' or a temp path. */
export function openLedgerDb(dbPath: string = defaultLedgerDbPath()): LedgerDb {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

const openHandles = new Map<string, LedgerDb>()

/** Shared process-wide handle to the default Ledger DB (one per resolved path). */
export function ledgerDb(): LedgerDb {
  const dbPath = defaultLedgerDbPath()
  let handle = openHandles.get(dbPath)
  if (!handle) {
    handle = openLedgerDb(dbPath)
    openHandles.set(dbPath, handle)
  }
  return handle
}

/** ledgerDb(), or null when the Ledger cannot be opened — routes degrade instead of failing. */
export function tryLedgerDb(): LedgerDb | null {
  try {
    return ledgerDb()
  } catch {
    return null
  }
}
