import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import type { OverviewActivityEntry, OverviewResponse, OverviewSystem } from 'shared'
import { readRegistry } from '../readers/claudeJson.js'
import { resolveConfigRoot } from '../readers/configRoot.js'

export const overview = new Hono()

overview.get('/', (c) => {
  const configRoot = resolveConfigRoot()
  const registry = readRegistry(configRoot)

  const body: OverviewResponse = {
    configRoot,
    projects: {
      count: Object.keys(registry).length,
      topByLastCost: topProjectsByLastCost(registry)
    },
    systems: [...mcpSystems(registry), ...pluginSystems(configRoot), LEDGER_OFFLINE],
    activity: recentActivity(configRoot),
    // Ledger-backed aggregates — stay null until the Ledger build lands.
    spend14d: null,
    tokens14d: null,
    sessions14d: null,
    cachePct: null
  }
  return c.json(body)
})

const LEDGER_OFFLINE: OverviewSystem = { name: 'ledger', kind: 'ledger', on: false, status: 'OFFLINE' }

function lastPathSegment(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p
}

function topProjectsByLastCost(registry: ReturnType<typeof readRegistry>) {
  return Object.entries(registry)
    .filter(([, project]) => typeof project.lastCost === 'number' && project.lastCost > 0)
    .sort(([, a], [, b]) => b.lastCost! - a.lastCost!)
    .slice(0, 5)
    .map(([path, project]) => ({
      name: lastPathSegment(path),
      path,
      lastCost: project.lastCost!,
      lastSessionId: project.lastSessionId
    }))
}

/** Stdio MCP servers defined in any Registry entry, deduped by server name. */
function mcpSystems(registry: ReturnType<typeof readRegistry>): OverviewSystem[] {
  const names = new Set<string>()
  for (const project of Object.values(registry)) {
    for (const [name, server] of Object.entries(project.mcpServers ?? {})) {
      if (server.type === 'stdio' || server.command) names.add(name)
    }
  }
  return [...names].map((name) => ({ name, kind: 'mcp-local', on: true, status: 'CONFIGURED' }))
}

type InstalledPluginsFile = {
  plugins?: Record<string, Array<{ version?: string }>>
}

/** Installed plugins from <configRoot>/plugins/installed_plugins.json ("<plugin>@<marketplace>" keys). */
function pluginSystems(configRoot: string): OverviewSystem[] {
  let file: InstalledPluginsFile
  try {
    file = JSON.parse(readFileSync(join(configRoot, 'plugins', 'installed_plugins.json'), 'utf8'))
  } catch {
    return []
  }
  return Object.entries(file.plugins ?? {}).map(([key, installs]) => ({
    name: key.split('@')[0],
    kind: 'plugin',
    on: true,
    status: installs[0]?.version ?? 'unknown'
  }))
}

/** Last 8 prompts from <configRoot>/history.jsonl, newest first. */
function recentActivity(configRoot: string): OverviewActivityEntry[] {
  let raw: string
  try {
    raw = readFileSync(join(configRoot, 'history.jsonl'), 'utf8')
  } catch {
    return []
  }
  const entries: OverviewActivityEntry[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line) as { display?: string; timestamp?: number; project?: string }
      if (typeof record.display !== 'string' || typeof record.timestamp !== 'number') continue
      entries.push({
        display: record.display,
        timestamp: record.timestamp,
        project: lastPathSegment(record.project ?? '')
      })
    } catch {
      // skip malformed lines
    }
  }
  return entries.slice(-8).reverse()
}
