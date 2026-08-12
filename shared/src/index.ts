// Types shared between client and server.

export type HealthResponse = {
  status: 'ok'
}

/** A Registry entry ranked on the landing page. Costs are last-session only until the Ledger lands. */
export type OverviewProject = {
  /** Last path segment of the Registry key, e.g. "admin-center". */
  name: string
  /** The Registry key: the project cwd. */
  path: string
  /** Cost of the project's most recent session in USD (overwritten every run). */
  lastCost: number
  lastSessionId?: string
}

export type OverviewSystem = {
  name: string
  kind: 'mcp-local' | 'plugin' | 'ledger'
  on: boolean
  status: string
}

/** One submitted prompt from the config root's history.jsonl. */
export type OverviewActivityEntry = {
  display: string
  /** Epoch milliseconds. */
  timestamp: number
  /** Last path segment of the project the prompt was submitted in. */
  project: string
}

/** Ledger rollup of the last 30 days for one Project; null when the Ledger is unavailable. */
export type ProjectLedger30d = {
  sessions: number
  tokens: number
  /** Dollar sum of priced Turns only (Unpriced policy); null when none were priced. */
  costUsd: number | null
  unpricedTurns: number
} | null

/** One Project in the list: a Registry entry joined with disk state, or an Orphaned Project. */
export type ProjectRow = {
  /** Last path segment of the cwd (or the directory slug for an Orphaned Project). */
  name: string
  /** The Registry key (cwd); for an Orphaned Project the on-disk directory slug. */
  path: string
  orphaned: boolean
  /** A projects/<slug> directory exists for this Registry entry. */
  onDisk: boolean
  /** A Live Session is currently running in this cwd. */
  live: boolean
  lastCost: number | null
  lastSessionId: string | null
  /** Epoch ms of the latest known activity (registry lastStartTime vs newest Ledger Turn). */
  lastActiveMs: number | null
  /** Total tokens of the last session (all buckets), from the Registry entry. */
  lastTokens: number | null
  mcpServerCount: number
  /** Plugins this project's own settings files enable. */
  enabledPluginCount: number
  ledger30d: ProjectLedger30d
}

export type ProjectsResponse = {
  registryCount: number
  orphanCount: number
  /** Live Sessions currently registered, across all projects. */
  liveCount: number
  projects: ProjectRow[]
}

/** One Session on a Project's detail page. Agent Runs' usage is rolled up into it. */
export type ProjectSessionRow = {
  sessionId: string
  title: string | null
  /** ISO timestamp of the session's newest record. */
  lastTs: string | null
  live: boolean
  /** Transcript was garbage-collected — the Ledger record is all that remains. */
  transcriptGone: boolean
  agentRuns: number
  turns: number
  tokens: number
  costUsd: number | null
  unpricedTurns: number
}

export type EnablementRow = {
  name: string
  kind: 'plugin' | 'mcp'
  on: boolean
  scope: 'global' | 'this project' | 'overridden here'
}

/** Pointer to a Project's memory directory in the config root. */
export type ProjectMemory = {
  hasMemoryMd: boolean
  fileCount: number
  lastModifiedMs: number | null
}

export type ProjectDetailResponse = {
  project: ProjectRow
  sessions: ProjectSessionRow[]
  /** Effective Enablement: global settings + this project's overrides, resolved. */
  enablement: EnablementRow[]
  /** null when the project has no memory directory. */
  memory: ProjectMemory | null
}

/** One Session in the Sessions list: a Ledger record enriched with liveness and its project. */
export type SessionRow = {
  sessionId: string
  title: string | null
  /** Last path segment of the Session's cwd; null when the Ledger recorded no cwd. */
  projectName: string | null
  cwd: string | null
  live: boolean
  /** Transcript was garbage-collected — the Ledger record is all that remains. */
  transcriptGone: boolean
  firstTs: string | null
  lastTs: string | null
  /** First→last Turn span in ms; null when timestamps are missing. */
  durationMs: number | null
  agentRuns: number
  turns: number
  tokens: number
  costUsd: number | null
  unpricedTurns: number
  /** Distinct raw model ids used in this Session. */
  models: string[]
}

export type SessionsResponse = {
  /** Matching Ledger Sessions before the limit was applied. */
  total: number
  liveCount: number
  /** Sessions surviving only as Ledger records (transcript garbage-collected). */
  ledgerOnlyCount: number
  sessions: SessionRow[]
}

/** One Agent Run inside a Session's detail, with its own Turn rollup. */
export type SessionAgentRunRow = {
  agentId: string
  agentType: string | null
  description: string | null
  turns: number
  tokens: number
  costUsd: number | null
  unpricedTurns: number
}

/** Per-model rollup within one Session. */
export type SessionModelRow = {
  model: string
  turns: number
  tokens: number
  costUsd: number | null
  unpricedTurns: number
}

export type SessionDetailResponse = {
  session: SessionRow
  models: SessionModelRow[]
  agentRuns: SessionAgentRunRow[]
}

export type OverviewResponse = {
  configRoot: string
  projects: {
    /** Total Registry entries. */
    count: number
    /** Top 5 Registry entries by last-session cost, highest first. */
    topByLastCost: OverviewProject[]
  }
  systems: OverviewSystem[]
  /** Most recent prompts, newest first. */
  activity: OverviewActivityEntry[]
  /** Ledger-backed aggregates — null until the Ledger build lands. */
  spend14d: number | null
  tokens14d: number | null
  sessions14d: number | null
  cachePct: number | null
}
