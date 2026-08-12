import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServerRow, McpServersResponse } from 'shared'
import { readMcpEverConnected, readRegistry, type McpServerDefinition, type RegistryProject } from './claudeJson.js'

/**
 * The unified MCP Server list: local stdio definitions deduped across Registry
 * projects, plus managed claude.ai connectors — known locally only through the
 * auth cache and the ever-connected list, since their definitions live server-side.
 */
export function listMcpServers(configRoot: string): McpServersResponse {
  const local = localServers(configRoot)
  const managed = managedServers(configRoot)
  return {
    localCount: local.length,
    managedCount: managed.length,
    servers: [...local, ...managed]
  }
}

/** One row per distinct server name across all Registry projects' mcpServers maps. */
function localServers(configRoot: string): McpServerRow[] {
  const rows = new Map<string, McpServerRow>()
  for (const [cwd, entry] of Object.entries(readRegistry(configRoot))) {
    for (const [name, definition] of Object.entries(entry.mcpServers ?? {})) {
      const row =
        rows.get(name) ??
        rows
          .set(name, {
            key: `local:${name}`,
            name,
            provenance: 'local',
            commandSummary: commandSummary(definition),
            definedInProjects: [],
            disabledInProjects: 0,
            lastAuthMs: null,
            managedId: null,
            everConnected: false
          })
          .get(name)!
      row.definedInProjects.push(lastPathSegment(cwd))
      if (disabledIn(entry, name)) row.disabledInProjects += 1
    }
  }
  return [...rows.values()].sort(byName)
}

/** "command firstArg" only — the rest of args and the env map (secrets) are never surfaced. */
function commandSummary(definition: McpServerDefinition): string | null {
  const parts = [definition.command, definition.args?.[0]].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(' ') : null
}

/** The project's enable/disable arrays turn this server off. */
function disabledIn(entry: RegistryProject, name: string): boolean {
  return (entry.disabledMcpServers ?? []).includes(name) || (entry.disabledMcpjsonServers ?? []).includes(name)
}

type AuthCacheEntry = {
  /** Epoch ms of the last auth. */
  timestamp?: number
  /** "mcpsrv_…" — absent on some entries. */
  id?: string
}

/**
 * Managed connectors: <configRoot>/mcp-needs-auth-cache.json (display name →
 * {timestamp, id}) joined with claudeAiMcpEverConnected — names only there
 * still get a row, with no auth timestamp.
 */
function managedServers(configRoot: string): McpServerRow[] {
  const rows = new Map<string, McpServerRow>()
  for (const [name, entry] of Object.entries(readAuthCache(configRoot))) {
    rows.set(name, {
      key: `managed:${name}`,
      name,
      provenance: 'managed',
      commandSummary: null,
      definedInProjects: [],
      disabledInProjects: 0,
      lastAuthMs: entry.timestamp ?? null,
      managedId: entry.id ?? null,
      everConnected: false
    })
  }
  for (const name of readMcpEverConnected(configRoot)) {
    const row = rows.get(name)
    if (row) {
      row.everConnected = true
    } else {
      rows.set(name, {
        key: `managed:${name}`,
        name,
        provenance: 'managed',
        commandSummary: null,
        definedInProjects: [],
        disabledInProjects: 0,
        lastAuthMs: null,
        managedId: null,
        everConnected: true
      })
    }
  }
  return [...rows.values()].sort(byName)
}

function readAuthCache(configRoot: string): Record<string, AuthCacheEntry> {
  try {
    return JSON.parse(readFileSync(join(configRoot, 'mcp-needs-auth-cache.json'), 'utf8')) as Record<
      string,
      AuthCacheEntry
    >
  } catch {
    return {}
  }
}

function byName(a: McpServerRow, b: McpServerRow): number {
  return a.name.localeCompare(b.name)
}

function lastPathSegment(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).at(-1) ?? p
}
