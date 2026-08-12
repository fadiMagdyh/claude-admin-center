import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillRow, SkillStatus, SkillsResponse } from 'shared'
import type { LedgerDb } from '../ledger/db.js'
import { attributionTotals } from '../ledger/queries.js'
import { readRegistry, readSkillUsage } from './claudeJson.js'
import { installDir, readInstalledPlugins, readSettingsFile, registryProjectSettings, splitPluginKey } from './installedPlugins.js'

/** A SkillRow being assembled, plus the join keys the response never carries. */
type Skill = SkillRow & {
  /** skillUsage / attributionSkill keys that resolve to this row ("plugin:name" and bare name). */
  matchKeys: string[]
  /** "plugin@marketplace" — the enabledPlugins key of the owning plugin. */
  pluginKey: string | null
}

/**
 * The unified Skill list across all three Skill Sources (decision #5): plugin
 * cache SKILL.md trees, project .claude/skills dirs, and built-in ghost rows
 * derived from usage data. Enriched with skillUsage counters, Ledger
 * attribution, and global enablement + the overridden-in-N-projects indicator
 * (decision #6). Pass db=null when the Ledger is unavailable.
 */
export function listSkills(configRoot: string, db: LedgerDb | null): SkillsResponse {
  const skills = [...pluginSkills(configRoot), ...projectSkills(configRoot)]
  const byMatchKey = new Map<string, Skill>()
  for (const skill of skills) {
    for (const key of skill.matchKeys) {
      if (!byMatchKey.has(key)) byMatchKey.set(key, skill)
    }
  }

  const ghostFor = (usageKey: string): Skill => {
    const existing = byMatchKey.get(usageKey)
    if (existing) return existing
    const ghost = builtInGhost(usageKey)
    byMatchKey.set(usageKey, ghost)
    skills.push(ghost)
    return ghost
  }

  for (const [usageKey, entry] of Object.entries(readSkillUsage(configRoot))) {
    const skill = ghostFor(usageKey)
    skill.usageCount = (skill.usageCount ?? 0) + (entry.usageCount ?? 0)
    if (entry.lastUsedAt && entry.lastUsedAt > (skill.lastUsedAtMs ?? 0)) skill.lastUsedAtMs = entry.lastUsedAt
  }

  if (db) {
    for (const attributed of attributionTotals(db).skills) {
      const skill = ghostFor(attributed.name)
      skill.ledgerTurns += attributed.turns
      if (!skill.ledgerLastTs || attributed.lastTs > skill.ledgerLastTs) skill.ledgerLastTs = attributed.lastTs
    }
  }

  applyEnablement(configRoot, skills)
  skills.sort((a, b) => lastActiveMs(b) - lastActiveMs(a) || a.name.localeCompare(b.name))

  return { skills: skills.map(({ matchKeys: _keys, pluginKey: _pk, ...row }) => row) }
}

// ---------- plugin-bundled skills ----------

/** Bundled-skill count per installed plugin key ("plugin@marketplace"), for the plugins reader. */
export function pluginSkillCounts(configRoot: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const skill of pluginSkills(configRoot)) {
    counts.set(skill.pluginKey!, (counts.get(skill.pluginKey!) ?? 0) + 1)
  }
  return counts
}

/**
 * SKILL.md trees of the installed plugin versions only (installed_plugins.json
 * points at the exact cache dir — other cached versions are ignored).
 */
function pluginSkills(configRoot: string): Skill[] {
  const skills: Skill[] = []
  const seen = new Set<string>()
  for (const [pluginKey, installs] of Object.entries(readInstalledPlugins(configRoot))) {
    const { plugin, marketplace } = splitPluginKey(pluginKey)
    for (const install of installs) {
      const versionDir = installDir(configRoot, plugin, marketplace, install)
      for (const found of walkSkillDirs(join(versionDir, 'skills'))) {
        const front = readFrontmatter(join(found.dir, 'SKILL.md'))
        const name = front.name ?? found.segments.at(-1)!
        if (seen.has(`${plugin}:${name}`)) continue
        seen.add(`${plugin}:${name}`)
        skills.push({
          ...emptyRow(`plugin:${plugin}:${name}`, name, 'plugin'),
          status: statusFromPath(found.segments),
          plugin,
          description: front.description ?? null,
          matchKeys: [`${plugin}:${name}`, name],
          pluginKey
        })
      }
    }
  }
  return skills
}

type FoundSkill = { dir: string; segments: string[] }

/** Directories under skills/ that contain a SKILL.md; a skill's own subdirectories are not entered. */
function* walkSkillDirs(root: string, segments: string[] = []): Generator<FoundSkill> {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) {
    if (segments.length > 0) yield { dir: root, segments }
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory()) yield* walkSkillDirs(join(root, entry.name), [...segments, entry.name])
  }
}

/** Status from the SKILL.md path: deprecated/ and in-progress/ subtrees; anything else is normal. */
function statusFromPath(segments: string[]): SkillStatus {
  const tree = segments.slice(0, -1)
  if (tree.includes('deprecated')) return 'deprecated'
  if (tree.includes('in-progress')) return 'in-progress'
  return 'normal'
}

/**
 * name/description from a SKILL.md's YAML frontmatter. Tolerant on purpose:
 * single-line "key: value" pairs only, anything else is ignored.
 */
function readFrontmatter(skillMdPath: string): { name?: string; description?: string } {
  let text: string
  try {
    text = readFileSync(skillMdPath, 'utf8')
  } catch {
    return {}
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!frontmatter) return {}
  const fields: Record<string, string> = {}
  for (const line of frontmatter[1].split(/\r?\n/)) {
    const pair = /^([\w-]+):\s*(.+)$/.exec(line)
    if (pair) fields[pair[1]] = pair[2].trim()
  }
  return { name: fields.name, description: fields.description }
}

// ---------- project skills ----------

/** One row per <cwd>/.claude/skills/<name>/ across all Registry projects — a cheap existence walk. */
function projectSkills(configRoot: string): Skill[] {
  const skills: Skill[] = []
  const seenCwds = new Set<string>()
  for (const cwd of Object.keys(readRegistry(configRoot))) {
    const canonical = cwd.replace(/\\/g, '/').toLowerCase()
    if (seenCwds.has(canonical)) continue
    seenCwds.add(canonical)
    let entries
    try {
      entries = readdirSync(join(cwd, '.claude', 'skills'), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const front = readFrontmatter(join(cwd, '.claude', 'skills', entry.name, 'SKILL.md'))
      skills.push({
        ...emptyRow(`project:${cwd}:${entry.name}`, entry.name, 'project'),
        projectPath: cwd,
        description: front.description ?? null,
        enabled: true,
        matchKeys: [entry.name]
      })
    }
  }
  return skills
}

// ---------- built-in ghost rows ----------

/** A usage key that matches no on-disk skill: shipped in the binary, visible only through usage data. */
function builtInGhost(usageKey: string): Skill {
  const colonIndex = usageKey.indexOf(':')
  const plugin = colonIndex === -1 ? null : usageKey.slice(0, colonIndex)
  const name = colonIndex === -1 ? usageKey : usageKey.slice(colonIndex + 1)
  return {
    ...emptyRow(`built-in:${plugin ?? ''}:${name}`, name, 'built-in'),
    ghost: true,
    plugin,
    matchKeys: [usageKey]
  }
}

// ---------- enablement ----------

/**
 * Global enabledPlugins state for plugin rows, plus the overridden-in-N-projects
 * count: Registry projects whose own settings files mention the owning plugin
 * or the skill itself (Effective Enablement stays lazy on the Project detail).
 */
function applyEnablement(configRoot: string, skills: Skill[]): void {
  const globalPlugins = readSettingsFile(join(configRoot, 'settings.json')).enabledPlugins
  const projectSettings = registryProjectSettings(configRoot)
  for (const skill of skills) {
    if (skill.pluginKey) skill.enabled = globalPlugins[skill.pluginKey] ?? null
    skill.overriddenInProjects = projectSettings.filter(
      (settings) =>
        (skill.pluginKey !== null && skill.pluginKey in settings.enabledPlugins) ||
        skill.matchKeys.some((key) => key in settings.skillOverrides)
    ).length
  }
}

// ---------- shared bits ----------

function emptyRow(key: string, name: string, source: SkillRow['source']): Skill {
  return {
    key,
    name,
    source,
    status: 'normal',
    ghost: false,
    plugin: null,
    projectPath: null,
    description: null,
    usageCount: null,
    lastUsedAtMs: null,
    ledgerTurns: 0,
    ledgerLastTs: null,
    enabled: null,
    overriddenInProjects: 0,
    matchKeys: [],
    pluginKey: null
  }
}

/** Newest activity signal for sorting: skillUsage hit vs newest attributed Turn. */
function lastActiveMs(skill: Skill): number {
  const ledgerMs = skill.ledgerLastTs ? Date.parse(skill.ledgerLastTs) : 0
  return Math.max(skill.lastUsedAtMs ?? 0, ledgerMs)
}
