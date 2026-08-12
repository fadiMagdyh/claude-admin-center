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
