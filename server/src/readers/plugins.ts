import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginRow, PluginsResponse } from 'shared'
import type { LedgerDb } from '../ledger/db.js'
import { attributionTotals } from '../ledger/queries.js'
import { readPluginUsage } from './claudeJson.js'
import { readInstalledPlugins, readSettingsFile, registryProjectSettings, splitPluginKey } from './installedPlugins.js'
import { pluginSkillCounts } from './skills.js'

/**
 * The Plugins list: installed_plugins.json entries enriched with bundled-skill
 * counts, marketplace-catalog descriptions, pluginUsage counters, Ledger
 * attribution, and global enablement + the overridden-in-N-projects indicator.
 * pluginUsage keys matching no installed plugin become uninstalled historical
 * rows — their lifetime counters survive the uninstall. Pass db=null when the
 * Ledger is unavailable.
 */
export function listPlugins(configRoot: string, db: LedgerDb | null): PluginsResponse {
  const skillCounts = pluginSkillCounts(configRoot)
  const describe = catalogLookup(configRoot)
  const byKey = new Map<string, PluginRow>()

  for (const [key, installs] of Object.entries(readInstalledPlugins(configRoot))) {
    const install = installs[0] // one install record per key in practice; the first wins otherwise
    byKey.set(key, {
      ...emptyRow(key, describe),
      installed: true,
      version: install?.version ?? null,
      scope: install?.scope ?? null,
      installedAt: install?.installedAt ?? null,
      skillCount: skillCounts.get(key) ?? 0
    })
  }

  for (const [key, usage] of Object.entries(readPluginUsage(configRoot))) {
    let row = byKey.get(key)
    if (!row) {
      row = emptyRow(key, describe) // uninstalled: pluginUsage is its only remaining trace
      byKey.set(key, row)
    }
    row.usageCount = usage.usageCount ?? 0
    row.lastUsedAtMs = usage.lastUsedAt ?? null
  }

  const plugins = [...byKey.values()]

  if (db) {
    // attributionPlugin carries the bare plugin name; an installed row wins a name collision.
    const byName = new Map<string, PluginRow>()
    for (const row of [...plugins].sort((a, b) => Number(b.installed) - Number(a.installed))) {
      if (!byName.has(row.name)) byName.set(row.name, row)
    }
    for (const attributed of attributionTotals(db).plugins) {
      const row = byName.get(attributed.name)
      if (!row) continue
      row.ledgerTurns = attributed.turns
      row.ledgerLastTs = attributed.lastTs
    }
  }

  const globalPlugins = readSettingsFile(join(configRoot, 'settings.json')).enabledPlugins
  const projectSettings = registryProjectSettings(configRoot)
  for (const row of plugins) {
    row.enabled = globalPlugins[row.key] ?? null
    row.overriddenInProjects = projectSettings.filter((settings) => row.key in settings.enabledPlugins).length
  }

  plugins.sort(
    (a, b) => Number(b.installed) - Number(a.installed) || lastActiveMs(b) - lastActiveMs(a) || a.name.localeCompare(b.name)
  )
  return { plugins }
}

function emptyRow(key: string, describe: (marketplace: string, plugin: string) => string | null): PluginRow {
  const { plugin, marketplace } = splitPluginKey(key)
  return {
    key,
    name: plugin,
    marketplace,
    installed: false,
    version: null,
    scope: null,
    installedAt: null,
    skillCount: 0,
    description: describe(marketplace, plugin),
    usageCount: null,
    lastUsedAtMs: null,
    ledgerTurns: 0,
    ledgerLastTs: null,
    enabled: null,
    overriddenInProjects: 0
  }
}

/** Description lookup against marketplace catalogs, each catalog file read at most once. */
function catalogLookup(configRoot: string): (marketplace: string, plugin: string) => string | null {
  const catalogs = new Map<string, Map<string, string>>()
  return (marketplace, plugin) => {
    let catalog = catalogs.get(marketplace)
    if (!catalog) {
      catalog = readCatalog(configRoot, marketplace)
      catalogs.set(marketplace, catalog)
    }
    return catalog.get(plugin) ?? null
  }
}

/** Plugin descriptions from marketplaces/<name>/.claude-plugin/marketplace.json; empty when absent. */
function readCatalog(configRoot: string, marketplace: string): Map<string, string> {
  try {
    const parsed = JSON.parse(
      readFileSync(join(configRoot, 'plugins', 'marketplaces', marketplace, '.claude-plugin', 'marketplace.json'), 'utf8')
    ) as { plugins?: Array<{ name?: string; description?: string }> }
    const descriptions = new Map<string, string>()
    for (const entry of parsed.plugins ?? []) {
      if (entry.name && entry.description) descriptions.set(entry.name, entry.description)
    }
    return descriptions
  } catch {
    return new Map()
  }
}

/** Newest activity signal for sorting: pluginUsage hit vs newest attributed Turn. */
function lastActiveMs(row: PluginRow): number {
  const ledgerMs = row.ledgerLastTs ? Date.parse(row.ledgerLastTs) : 0
  return Math.max(row.lastUsedAtMs ?? 0, ledgerMs)
}
