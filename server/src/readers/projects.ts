import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  EnablementRow, ProjectDetailResponse, ProjectLedger30d, ProjectMemory, ProjectRow, ProjectsResponse
} from 'shared'
import type { LedgerDb } from '../ledger/db.js'
import { canonicalCwd, sessionsForCwd, totalTokens, totalsByCwd, type CwdTotals } from '../ledger/queries.js'
import { readRegistry, type RegistryProject } from './claudeJson.js'
import { readLiveSessions } from './liveSessions.js'

const LEDGER_WINDOW_DAYS = 30

/**
 * Every Project: Registry entries (canonical) joined on cwd with disk state,
 * Live Sessions, and Ledger 30d stats, plus Orphaned Project rows for on-disk
 * directories no Registry entry matches. Pass db=null when the Ledger is unavailable.
 */
export function listProjects(configRoot: string, db: LedgerDb | null): ProjectsResponse {
  const registry = readRegistry(configRoot)
  const onDiskDirs = listProjectDirs(configRoot)
  const liveSessions = readLiveSessions(configRoot)
  const liveCwds = new Set(liveSessions.map((s) => canonicalCwd(s.cwd)))
  const ledger = db ? totalsByCwd(db, LEDGER_WINDOW_DAYS) : null

  const dirBySlug = new Map(onDiskDirs.map((dir) => [dir.toLowerCase(), dir]))
  const matchedDirs = new Set<string>()

  const projects = Object.entries(registry).map(([cwd, entry]) => {
    const dir = dirBySlug.get(projectDirSlug(cwd).toLowerCase())
    if (dir) matchedDirs.add(dir)
    return registryRow(configRoot, cwd, entry, dir !== undefined, liveCwds, ledger)
  })
  for (const dir of onDiskDirs) {
    if (!matchedDirs.has(dir)) projects.push(orphanRow(dir))
  }
  projects.sort((a, b) => (b.lastActiveMs ?? 0) - (a.lastActiveMs ?? 0))

  return {
    registryCount: Object.keys(registry).length,
    orphanCount: projects.filter((p) => p.orphaned).length,
    liveCount: liveSessions.length,
    projects
  }
}

/**
 * One Project's detail: its list row plus Ledger Sessions (Agent Runs rolled
 * up), Effective Enablement resolved lazily, and the memory pointer. Null when
 * the cwd is not a Registry entry.
 */
export function getProject(configRoot: string, db: LedgerDb | null, cwd: string): ProjectDetailResponse | null {
  const entry = readRegistry(configRoot)[cwd]
  if (!entry) return null

  const liveSessions = readLiveSessions(configRoot)
  const liveCwds = new Set(liveSessions.map((s) => canonicalCwd(s.cwd)))
  const liveSessionIds = new Set(liveSessions.map((s) => s.sessionId))
  const dir = findProjectDir(configRoot, cwd)
  const ledger = db ? totalsByCwd(db, LEDGER_WINDOW_DAYS) : null

  const sessions = db
    ? sessionsForCwd(db, cwd).map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        lastTs: s.lastTs,
        live: liveSessionIds.has(s.sessionId),
        transcriptGone: s.transcriptGone,
        agentRuns: s.agentRuns,
        turns: s.turns,
        tokens: totalTokens(s),
        costUsd: s.costUsd,
        unpricedTurns: s.unpricedTurns
      }))
    : []

  return {
    project: registryRow(configRoot, cwd, entry, dir !== undefined, liveCwds, ledger),
    sessions,
    enablement: effectiveEnablement(configRoot, cwd, entry),
    memory: readMemory(configRoot, dir)
  }
}

function registryRow(
  configRoot: string,
  cwd: string,
  entry: RegistryProject,
  onDisk: boolean,
  liveCwds: Set<string>,
  ledger: Map<string, CwdTotals> | null
): ProjectRow {
  const stats = ledger?.get(canonicalCwd(cwd))
  const ledger30d: ProjectLedger30d = ledger
    ? {
        sessions: stats?.sessions ?? 0,
        tokens: stats ? totalTokens(stats) : 0,
        costUsd: stats?.costUsd ?? null,
        unpricedTurns: stats?.unpricedTurns ?? 0
      }
    : null
  const ledgerLastMs = stats?.lastTs ? Date.parse(stats.lastTs) : 0
  const lastActiveMs = Math.max(entry.lastStartTime ?? 0, ledgerLastMs)
  const lastTokens =
    entry.lastTotalInputTokens === undefined && entry.lastTotalOutputTokens === undefined
      ? null
      : (entry.lastTotalInputTokens ?? 0) +
        (entry.lastTotalOutputTokens ?? 0) +
        (entry.lastTotalCacheCreationInputTokens ?? 0) +
        (entry.lastTotalCacheReadInputTokens ?? 0)

  return {
    name: lastPathSegment(cwd),
    path: cwd,
    orphaned: false,
    onDisk,
    live: liveCwds.has(canonicalCwd(cwd)),
    lastCost: entry.lastCost ?? null,
    lastSessionId: entry.lastSessionId ?? null,
    lastActiveMs: lastActiveMs > 0 ? lastActiveMs : null,
    lastTokens,
    mcpServerCount: Object.keys(entry.mcpServers ?? {}).length,
    enabledPluginCount: Object.values(projectPluginOverrides(cwd)).filter((on) => on).length,
    ledger30d
  }
}

/** An on-disk project directory with no Registry entry. Its cwd is unrecoverable from the lossy slug. */
function orphanRow(dir: string): ProjectRow {
  return {
    name: dir,
    path: dir,
    orphaned: true,
    onDisk: true,
    live: false,
    lastCost: null,
    lastSessionId: null,
    lastActiveMs: null,
    lastTokens: null,
    mcpServerCount: 0,
    enabledPluginCount: 0,
    ledger30d: null
  }
}

/**
 * Effective Enablement: global settings.json plugins, overlaid with this
 * project's settings.json / settings.local.json, plus the Registry entry's
 * MCP definitions and enable/disable arrays.
 */
function effectiveEnablement(configRoot: string, cwd: string, entry: RegistryProject): EnablementRow[] {
  const rows = new Map<string, EnablementRow>()

  for (const [key, on] of Object.entries(readEnabledPlugins(join(configRoot, 'settings.json')))) {
    rows.set(`plugin:${key}`, { name: pluginName(key), kind: 'plugin', on, scope: 'global' })
  }
  for (const [key, on] of Object.entries(projectPluginOverrides(cwd))) {
    const scope = rows.has(`plugin:${key}`) ? 'overridden here' : 'this project'
    rows.set(`plugin:${key}`, { name: pluginName(key), kind: 'plugin', on, scope })
  }

  const disabledMcp = new Set(entry.disabledMcpServers ?? [])
  for (const name of Object.keys(entry.mcpServers ?? {})) {
    rows.set(`mcp:${name}`, { name, kind: 'mcp', on: !disabledMcp.has(name), scope: 'this project' })
  }
  for (const name of entry.enabledMcpjsonServers ?? []) {
    rows.set(`mcp:${name}`, { name, kind: 'mcp', on: true, scope: 'this project' })
  }
  for (const name of entry.disabledMcpjsonServers ?? []) {
    rows.set(`mcp:${name}`, { name, kind: 'mcp', on: false, scope: 'this project' })
  }
  for (const name of disabledMcp) {
    if (!rows.has(`mcp:${name}`)) rows.set(`mcp:${name}`, { name, kind: 'mcp', on: false, scope: 'overridden here' })
  }

  return [...rows.values()]
}

/** enabledPlugins from the project's own .claude/settings.json then settings.local.json (local wins). */
function projectPluginOverrides(cwd: string): Record<string, boolean> {
  return {
    ...readEnabledPlugins(join(cwd, '.claude', 'settings.json')),
    ...readEnabledPlugins(join(cwd, '.claude', 'settings.local.json'))
  }
}

function readEnabledPlugins(settingsPath: string): Record<string, boolean> {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { enabledPlugins?: Record<string, boolean> }
    return settings.enabledPlugins ?? {}
  } catch {
    return {}
  }
}

/** "plugin@marketplace" → "plugin". */
function pluginName(key: string): string {
  return key.split('@')[0]
}

function readMemory(configRoot: string, dir: string | undefined): ProjectMemory | null {
  if (!dir) return null
  const memoryDir = join(configRoot, 'projects', dir, 'memory')
  let entries
  try {
    entries = readdirSync(memoryDir, { withFileTypes: true })
  } catch {
    return null
  }
  const files = entries.filter((e) => e.isFile())
  let lastModifiedMs: number | null = null
  for (const file of files) {
    const mtimeMs = Math.trunc(statSync(join(memoryDir, file.name)).mtimeMs)
    if (lastModifiedMs === null || mtimeMs > lastModifiedMs) lastModifiedMs = mtimeMs
  }
  return {
    hasMemoryMd: files.some((f) => f.name === 'MEMORY.md'),
    fileCount: files.length,
    lastModifiedMs
  }
}

function listProjectDirs(configRoot: string): string[] {
  try {
    return readdirSync(join(configRoot, 'projects'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

function findProjectDir(configRoot: string, cwd: string): string | undefined {
  const slug = projectDirSlug(cwd).toLowerCase()
  return listProjectDirs(configRoot).find((dir) => dir.toLowerCase() === slug)
}

/** How Claude Code mangles a cwd into a projects/ directory name — lossy, so only used disk→registry. */
function projectDirSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

function lastPathSegment(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p
}
