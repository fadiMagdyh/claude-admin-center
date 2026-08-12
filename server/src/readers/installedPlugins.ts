import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readRegistry } from './claudeJson.js'

// Plugin-installation and enablement helpers shared by the skills and plugins readers.

/** One install record in installed_plugins.json (v2). */
export type PluginInstall = {
  scope?: string
  version?: string
  installPath?: string
  installedAt?: string
}

/** installed_plugins.json v2: install records keyed "<plugin>@<marketplace>". Empty when the file is missing. */
export function readInstalledPlugins(configRoot: string): Record<string, PluginInstall[]> {
  try {
    const parsed = JSON.parse(readFileSync(join(configRoot, 'plugins', 'installed_plugins.json'), 'utf8')) as {
      plugins?: Record<string, PluginInstall[]>
    }
    return parsed.plugins ?? {}
  } catch {
    return {}
  }
}

/** Split a "<plugin>@<marketplace>" key; keys without "@" get an empty marketplace. */
export function splitPluginKey(pluginKey: string): { plugin: string; marketplace: string } {
  const atIndex = pluginKey.lastIndexOf('@')
  if (atIndex === -1) return { plugin: pluginKey, marketplace: '' }
  return { plugin: pluginKey.slice(0, atIndex), marketplace: pluginKey.slice(atIndex + 1) }
}

/** The extracted plugin directory of one install (installPath wins over the conventional cache path). */
export function installDir(configRoot: string, plugin: string, marketplace: string, install: PluginInstall): string {
  return install.installPath ?? join(configRoot, 'plugins', 'cache', marketplace, plugin, install.version ?? 'unknown')
}

export type ProjectSettings = {
  enabledPlugins: Record<string, boolean>
  skillOverrides: Record<string, unknown>
}

/** Each Registry project's settings.json + settings.local.json merged (local wins). */
export function registryProjectSettings(configRoot: string): ProjectSettings[] {
  const settings: ProjectSettings[] = []
  const seenCwds = new Set<string>()
  for (const cwd of Object.keys(readRegistry(configRoot))) {
    const canonical = cwd.replace(/\\/g, '/').toLowerCase()
    if (seenCwds.has(canonical)) continue
    seenCwds.add(canonical)
    const base = readSettingsFile(join(cwd, '.claude', 'settings.json'))
    const local = readSettingsFile(join(cwd, '.claude', 'settings.local.json'))
    settings.push({
      enabledPlugins: { ...base.enabledPlugins, ...local.enabledPlugins },
      skillOverrides: { ...base.skillOverrides, ...local.skillOverrides }
    })
  }
  return settings
}

/** enabledPlugins/skillOverrides from one settings file; empty when it is missing or malformed. */
export function readSettingsFile(settingsPath: string): ProjectSettings {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as Partial<ProjectSettings>
    return { enabledPlugins: parsed.enabledPlugins ?? {}, skillOverrides: parsed.skillOverrides ?? {} }
  } catch {
    return { enabledPlugins: {}, skillOverrides: {} }
  }
}
