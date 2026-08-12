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

/** One Model in the landing loadout: 14d Ledger rollup, [1m] collapsed into the base Model. */
export type OverviewModel = {
  /** Base model id. */
  model: string
  costUsd: number | null
  unpricedTurns: number
  /** Some collapsed Turns used the [1m] long-context variant. */
  longContext: boolean
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
  /** Model loadout over the last 14 days, highest cost first; empty when the Ledger is empty. */
  models: OverviewModel[]
}

export type UsageRange = '7' | '14' | '30' | 'all'

/** The Usage section's stat tiles, scoped to the requested range (Ledger span excepted). */
export type UsageTiles = {
  /** Dollar sum of priced Turns only (Unpriced policy); null when none were priced. */
  costUsd: number | null
  unpricedTurns: number
  tokens: number
  sessions: number
  /** Cache reads as a percentage of all input-side tokens. */
  cachePct: number
  /** Whole days between the Ledger's oldest and newest Turn, inclusive — the full history span. */
  historyDays: number
}

/** One stacked-bar segment: a base Model's priced spend on one day. */
export type UsageDayModel = {
  model: string
  cost: number
  unpricedTurns: number
}

/** One local-calendar day of the chart; days with no Turns are zero-filled for a continuous axis. */
export type UsageDay = {
  /** YYYY-MM-DD in the server's local timezone. */
  day: string
  perModel: UsageDayModel[]
  /** Priced spend summed across Models. */
  total: number
}

/** Per-Model rollup for the range, [1m] collapsed into the base Model, highest cost first. */
export type UsageModelRow = {
  model: string
  longContext: boolean
  turns: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  /** 5m + 1h cache writes combined. */
  cacheWrite: number
  /** All token buckets summed. */
  tokens: number
  costUsd: number | null
  unpricedTurns: number
}

export type UsageResponse = {
  range: UsageRange
  tiles: UsageTiles
  days: UsageDay[]
  models: UsageModelRow[]
  /** Unpriced policy summary: Turns excluded from dollar totals and the base Models they came from. */
  unpriced: { turns: number; models: string[] }
}

export type ModelsRange = '30' | 'all'

/** Today's price-table rates for a Model, USD per MTok; null when Unpriced. */
export type ModelPrice = {
  input: number
  output: number
  cacheRead: number
}

/** One base Model in the Models section, [1m] collapsed, all-Ledger aggregates. */
export type ModelRow = {
  /** Base model id. */
  model: string
  /** Some collapsed Turns used the [1m] long-context variant. */
  longContext: boolean
  /** This Model is the default pinned in <configRoot>/settings.json (compared after [1m] collapse). */
  pinnedDefault: boolean
  /** ISO timestamps of the Model's oldest and newest Turn in range. */
  firstTs: string
  lastTs: string
  turns: number
  /** Distinct Sessions with at least one Turn on this Model. */
  sessions: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  /** 5m + 1h cache writes combined. */
  cacheWrite: number
  /** All token buckets summed. */
  tokens: number
  costUsd: number | null
  unpricedTurns: number
  price: ModelPrice | null
}

export type SkillSource = 'plugin' | 'project' | 'built-in'

/** From the SKILL.md path inside a plugin: deprecated/ and in-progress/ subtrees. */
export type SkillStatus = 'normal' | 'deprecated' | 'in-progress'

/** One Skill in the unified list across all three Skill Sources (decision #5: all statuses included). */
export type SkillRow = {
  /** Stable advisor key: "<source>:<owner>:<name>" (owner = plugin name, project cwd, or "" for built-ins). */
  key: string
  name: string
  source: SkillSource
  status: SkillStatus
  /** Built-in ghost row: known only from usage data, no SKILL.md on disk. */
  ghost: boolean
  /** Owning plugin (plugin source, or the prefix of a ghost's usage key); null otherwise. */
  plugin: string | null
  /** Owning project cwd (project source only). */
  projectPath: string | null
  description: string | null
  /** Lifetime counter from .claude.json skillUsage; null when the skill never appears there. */
  usageCount: number | null
  /** Epoch ms of the last skillUsage hit. */
  lastUsedAtMs: number | null
  /** Ledger Turns attributed to this Skill (attributionSkill). */
  ledgerTurns: number
  /** ISO timestamp of the newest attributed Turn. */
  ledgerLastTs: string | null
  /** Global enablement of the owning plugin; project skills are always on; null when unknown (built-ins, no global entry). */
  enabled: boolean | null
  /** Projects whose own settings mention the owning plugin or this skill (decision #6: indicator only, no eager matrix). */
  overriddenInProjects: number
}

export type SkillsResponse = {
  skills: SkillRow[]
}

/** One plugin: an installed_plugins.json entry, or a historical row known only from pluginUsage. */
export type PluginRow = {
  /** "<plugin>@<marketplace>" — the enabledPlugins / pluginUsage key, and the advisor objectKey. */
  key: string
  name: string
  marketplace: string
  /** False: uninstalled historical row — pluginUsage remembers it, installed_plugins.json does not. */
  installed: boolean
  version: string | null
  /** Install scope from installed_plugins.json, e.g. "user" or "project". */
  scope: string | null
  /** ISO timestamp of the install. */
  installedAt: string | null
  /** SKILL.md count bundled in the installed version. */
  skillCount: number
  /** From the marketplace catalog; null when the catalog or its entry is missing. */
  description: string | null
  /** Lifetime counter from .claude.json pluginUsage; null when the plugin never appears there. */
  usageCount: number | null
  /** Epoch ms of the last pluginUsage hit. */
  lastUsedAtMs: number | null
  /** Ledger Turns attributed to this plugin (attributionPlugin). */
  ledgerTurns: number
  /** ISO timestamp of the newest attributed Turn. */
  ledgerLastTs: string | null
  /** Global enabledPlugins state; null when settings have no entry. */
  enabled: boolean | null
  /** Projects whose own settings mention this plugin (indicator only, no eager matrix). */
  overriddenInProjects: number
}

export type PluginsResponse = {
  plugins: PluginRow[]
}

/** Where an MCP Server comes from: a project's stdio definition, or a claude.ai connector. */
export type McpProvenance = 'local' | 'managed'

/** One MCP Server in the unified list, whatever its provenance (one list, one term). */
export type McpServerRow = {
  /** "<provenance>:<name>" — the advisor objectKey. */
  key: string
  name: string
  provenance: McpProvenance
  /** Local only: "command firstArg" from the stdio definition — never the full args or env. */
  commandSummary: string | null
  /** Local only: last path segments of the Registry projects defining this server. */
  definedInProjects: string[]
  /** Local only: defining projects whose enable/disable arrays turn this server off. */
  disabledInProjects: number
  /** Managed only: epoch ms of the auth-cache entry; null for ever-connected-only rows. */
  lastAuthMs: number | null
  /** Managed only: "mcpsrv_…" id from the auth cache; null when the cache has none. */
  managedId: string | null
  /** Managed only: the connector appears in claudeAiMcpEverConnected. */
  everConnected: boolean
}

export type McpServersResponse = {
  localCount: number
  managedCount: number
  /** Local rows first, then managed, each sorted by name. */
  servers: McpServerRow[]
}

export type ModelsResponse = {
  range: ModelsRange
  /** Base id of the settings.json model pin ([1m] collapsed); null when nothing is pinned. */
  pinnedModel: string | null
  /** Highest cost first. */
  models: ModelRow[]
  /** Unpriced policy summary: Turns excluded from dollar totals and the base Models they came from. */
  unpriced: { turns: number; models: string[] }
}
