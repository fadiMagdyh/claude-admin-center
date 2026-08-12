import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** The slice of a Registry entry the dashboard reads. Unknown fields are ignored. */
export type RegistryProject = {
  lastCost?: number
  lastSessionId?: string
  /** Epoch ms. */
  lastStartTime?: number
  lastTotalInputTokens?: number
  lastTotalOutputTokens?: number
  lastTotalCacheCreationInputTokens?: number
  lastTotalCacheReadInputTokens?: number
  mcpServers?: Record<string, { type?: string; command?: string }>
  enabledMcpjsonServers?: string[]
  disabledMcpjsonServers?: string[]
  disabledMcpServers?: string[]
}

/** Lifetime counter for one skillUsage key ("plugin:skill" or a bare skill name). */
export type SkillUsageEntry = {
  usageCount?: number
  /** Epoch ms. */
  lastUsedAt?: number
}

/** Lifetime counter for one pluginUsage key ("plugin@marketplace") — uninstalled plugins keep theirs. */
export type PluginUsageEntry = {
  usageCount?: number
  /** Epoch ms. */
  lastUsedAt?: number
}

type ClaudeJson = {
  projects?: Record<string, RegistryProject>
  skillUsage?: Record<string, SkillUsageEntry>
  pluginUsage?: Record<string, PluginUsageEntry>
}

type CacheEntry = {
  mtimeMs: number
  checkedAt: number
  data: ClaudeJson
}

const RECHECK_MS = 15_000

const cache = new Map<string, CacheEntry>()

/**
 * Parsed <configRoot>/.claude.json. Re-stats the file at most every 15s and
 * re-parses only when its mtime changed. Returns {} when the file is missing.
 */
export function readClaudeJson(configRoot: string): ClaudeJson {
  const filePath = join(configRoot, '.claude.json')
  const entry = cache.get(configRoot)
  const now = Date.now()

  if (entry && now - entry.checkedAt < RECHECK_MS) return entry.data

  let mtimeMs: number
  try {
    mtimeMs = statSync(filePath).mtimeMs
  } catch {
    cache.delete(configRoot)
    return {}
  }

  if (entry && entry.mtimeMs === mtimeMs) {
    entry.checkedAt = now
    return entry.data
  }

  const data = JSON.parse(readFileSync(filePath, 'utf8')) as ClaudeJson
  cache.set(configRoot, { mtimeMs, checkedAt: now, data })
  return data
}

/** The Registry: the projects map inside .claude.json, keyed by cwd. */
export function readRegistry(configRoot: string): Record<string, RegistryProject> {
  return readClaudeJson(configRoot).projects ?? {}
}

/** Lifetime skillUsage counters from .claude.json, keyed "plugin:skill" or bare skill name. */
export function readSkillUsage(configRoot: string): Record<string, SkillUsageEntry> {
  return readClaudeJson(configRoot).skillUsage ?? {}
}

/** Lifetime pluginUsage counters from .claude.json, keyed "plugin@marketplace". */
export function readPluginUsage(configRoot: string): Record<string, PluginUsageEntry> {
  return readClaudeJson(configRoot).pluginUsage ?? {}
}
