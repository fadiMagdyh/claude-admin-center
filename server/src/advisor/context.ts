import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdvisorObjectType } from 'shared'
import type { LedgerDb } from '../ledger/db.js'
import { priceFor } from '../ledger/prices.js'
import { ledgerStatus, modelTotals, overviewNumbers } from '../ledger/queries.js'
import { readRegistry } from '../readers/claudeJson.js'
import { readInstalledPlugins, splitPluginKey, installDir } from '../readers/installedPlugins.js'
import { listMcpServers } from '../readers/mcp.js'
import { listPlugins } from '../readers/plugins.js'
import { getProject } from '../readers/projects.js'
import { getSession } from '../readers/sessions.js'
import { listSkills } from '../readers/skills.js'

/** Inline context cap (locked design #2): anything deeper is passed as file paths instead. */
const MAX_SUMMARY_CHARS = 50_000
const TRUNCATION_MARKER = '…[TRUNCATED AT 50KB — read the listed file paths for the rest]'
/** Inline SKILL.md cap — a skill body beyond this is readable via the file paths. */
const MAX_SKILL_MD_CHARS = 10_000
/** Session lists inside a project summary stay compact; Claude can read transcripts itself. */
const MAX_LIST_ITEMS = 20

/** Everything an Advisor Run needs about its target, assembled once per run. */
export type AdvisorContext = {
  /** Compact JSON summary inlined into the prompt, capped at ~50KB with a truncation marker. */
  summary: string
  /** Paths the spawned Claude may read directly (Read/Grep/Glob + --add-dir <configRoot>). */
  filePaths: string[]
  /** sha256 hex of the summary — the "input unchanged since last run" comparator. */
  contextHash: string
}

/**
 * Per-type context assembly (locked design #2): a compact inline summary from
 * the existing readers, plus file paths for selective deeper reading. Unknown
 * keys still assemble — the summary says so and the advisor reports on that.
 */
export function assembleContext(
  configRoot: string,
  db: LedgerDb | null,
  objectType: AdvisorObjectType,
  objectKey: string
): AdvisorContext {
  const { data, filePaths } = ASSEMBLERS[objectType](configRoot, db, objectKey)
  const summary = truncateSummary(JSON.stringify({ objectType, objectKey, ...data }, null, 1))
  return {
    summary,
    filePaths: filePaths.filter((p) => existsSync(p)),
    contextHash: createHash('sha256').update(summary).digest('hex')
  }
}

/** Cap the inline summary at ~50KB, marking the cut so the advisor knows it saw a prefix. */
export function truncateSummary(summary: string): string {
  if (summary.length <= MAX_SUMMARY_CHARS) return summary
  return summary.slice(0, MAX_SUMMARY_CHARS) + TRUNCATION_MARKER
}

type Assembled = { data: Record<string, unknown>; filePaths: string[] }
type Assembler = (configRoot: string, db: LedgerDb | null, objectKey: string) => Assembled

const ASSEMBLERS: Record<AdvisorObjectType, Assembler> = {
  project: projectContext,
  session: sessionContext,
  skill: skillContext,
  plugin: pluginContext,
  mcp: mcpContext,
  model: modelContext,
  overview: overviewContext
}

/** Registry entry + disk state + Ledger 30d stats + Effective Enablement, sessions capped. */
function projectContext(configRoot: string, db: LedgerDb | null, cwd: string): Assembled {
  const detail = getProject(configRoot, db, cwd)
  if (!detail) return { data: { notFound: 'no Registry entry for this cwd' }, filePaths: [] }
  const transcriptDir = join(configRoot, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  return {
    data: {
      project: detail.project,
      enablement: detail.enablement,
      memory: detail.memory,
      recentSessions: detail.sessions.slice(0, MAX_LIST_ITEMS),
      sessionCount: detail.sessions.length
    },
    filePaths: [transcriptDir, join(transcriptDir, 'memory', 'MEMORY.md')]
  }
}

/** Ledger rollup + per-model breakdown + Agent Runs, plus the transcript path when it survives. */
function sessionContext(configRoot: string, db: LedgerDb | null, sessionId: string): Assembled {
  const detail = getSession(configRoot, db, sessionId)
  if (!detail) return { data: { notFound: 'no Ledger Session with this id' }, filePaths: [] }
  const transcriptPath = db
    ? ((db.prepare('SELECT transcript_path FROM sessions WHERE session_id = ?').get(sessionId) as
        | { transcript_path: string | null }
        | undefined)?.transcript_path ?? null)
    : null
  return {
    data: { session: detail.session, models: detail.models, agentRuns: detail.agentRuns, transcriptPath },
    filePaths: transcriptPath && !detail.session.transcriptGone ? [transcriptPath] : []
  }
}

/** The unified-list SkillRow + inline SKILL.md (project skills) or the plugin cache dir to read. */
function skillContext(configRoot: string, db: LedgerDb | null, key: string): Assembled {
  const skill = listSkills(configRoot, db).skills.find((row) => row.key === key)
  if (!skill) return { data: { notFound: 'no Skill with this key' }, filePaths: [] }
  const filePaths: string[] = []
  let skillMd: string | null = null
  if (skill.source === 'project' && skill.projectPath) {
    const skillMdPath = join(skill.projectPath, '.claude', 'skills', skill.name, 'SKILL.md')
    skillMd = readTextCapped(skillMdPath, MAX_SKILL_MD_CHARS)
    filePaths.push(skillMdPath)
  } else if (skill.plugin) {
    filePaths.push(...pluginInstallDirs(configRoot, skill.plugin))
  }
  return { data: { skill, skillMd }, filePaths }
}

/** The PluginRow + its extracted cache dir and marketplace catalog for deeper reading. */
function pluginContext(configRoot: string, db: LedgerDb | null, key: string): Assembled {
  const plugin = listPlugins(configRoot, db).plugins.find((row) => row.key === key)
  if (!plugin) return { data: { notFound: 'no plugin with this key' }, filePaths: [] }
  return {
    data: { plugin },
    filePaths: [
      ...pluginInstallDirs(configRoot, plugin.name, plugin.marketplace),
      join(configRoot, 'plugins', 'marketplaces', plugin.marketplace, '.claude-plugin', 'marketplace.json')
    ]
  }
}

/** The unified-list row: definition summary + provenance + per-project enablement. */
function mcpContext(configRoot: string, _db: LedgerDb | null, key: string): Assembled {
  const server = listMcpServers(configRoot).servers.find((row) => row.key === key)
  if (!server) return { data: { notFound: 'no MCP Server with this key' }, filePaths: [] }
  return { data: { server }, filePaths: [] }
}

/** All-time Ledger rollup for the base Model + today's price-table entry. */
function modelContext(_configRoot: string, db: LedgerDb | null, model: string): Assembled {
  const totals = db ? modelTotals(db).find((row) => row.model === model) : undefined
  return {
    data: {
      ledgerTotals: totals ?? { notFound: 'no Ledger Turns for this base Model' },
      currentPrice: priceFor(model, new Date().toISOString())
    },
    filePaths: []
  }
}

/** Section-level headlines for the full-setup sweep — counts and 14d stats, no row dumps. */
function overviewContext(configRoot: string, db: LedgerDb | null, _key: string): Assembled {
  const registry = readRegistry(configRoot)
  const skills = listSkills(configRoot, db).skills
  const plugins = listPlugins(configRoot, db).plugins
  const mcpServers = listMcpServers(configRoot)
  return {
    data: {
      configRoot,
      projects: { registered: Object.keys(registry).length },
      ledger: db ? { ...ledgerStatus(db), last14d: overviewNumbers(db) } : null,
      models14d: db ? modelTotals(db, 14) : [],
      skills: {
        count: skills.length,
        bySource: countBy(skills, (skill) => skill.source),
        deprecated: skills.filter((skill) => skill.status === 'deprecated').length
      },
      plugins: {
        count: plugins.length,
        installed: plugins.filter((plugin) => plugin.installed).length,
        names: plugins.map((plugin) => plugin.key)
      },
      mcp: { local: mcpServers.localCount, managed: mcpServers.managedCount }
    },
    filePaths: [join(configRoot, 'settings.json')]
  }
}

// ---------- shared bits ----------

/** Extracted cache dirs of a plugin's installed versions (marketplace narrows the match). */
function pluginInstallDirs(configRoot: string, pluginName: string, marketplace?: string): string[] {
  const dirs: string[] = []
  for (const [key, installs] of Object.entries(readInstalledPlugins(configRoot))) {
    const split = splitPluginKey(key)
    if (split.plugin !== pluginName || (marketplace !== undefined && split.marketplace !== marketplace)) continue
    for (const install of installs) dirs.push(installDir(configRoot, split.plugin, split.marketplace, install))
  }
  return dirs
}

function readTextCapped(filePath: string, maxChars: number): string | null {
  try {
    const text = readFileSync(filePath, 'utf8')
    return text.length > maxChars ? text.slice(0, maxChars) + '…[truncated]' : text
  } catch {
    return null
  }
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) counts[keyOf(item)] = (counts[keyOf(item)] ?? 0) + 1
  return counts
}
