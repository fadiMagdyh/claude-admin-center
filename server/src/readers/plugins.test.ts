import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openLedgerDb, type LedgerDb } from '../ledger/db.js'
import { listPlugins } from './plugins.js'

const T_OLD = '2026-08-01T10:00:00.000Z'
const T_NEW = '2026-08-02T10:00:00.000Z'

let configRoot: string
let workdir: string
let db: LedgerDb

function writeSkillMd(dir: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '---\ndescription: A bundled skill.\n---\n')
}

beforeEach(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'plugins-config-'))
  workdir = mkdtempSync(join(tmpdir(), 'plugins-work-'))
  const workdirKey = workdir.replace(/\\/g, '/') // Registry keys use forward slashes

  writeFileSync(
    join(configRoot, '.claude.json'),
    JSON.stringify({
      projects: { [workdirKey]: {}, 'D:/missing/ghost': {} },
      pluginUsage: {
        'toolbox@market': { usageCount: 3, lastUsedAt: 5000 },
        'old-plugin@market': { usageCount: 7, lastUsedAt: 4000 }, // uninstalled, still in the catalog
        'gone-plugin@nowhere': { usageCount: 1, lastUsedAt: 1000 } // uninstalled, no catalog file at all
      }
    })
  )
  writeFileSync(
    join(configRoot, 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'toolbox@market': true, 'extras@market': false } })
  )

  mkdirSync(join(configRoot, 'plugins'), { recursive: true })
  writeFileSync(
    join(configRoot, 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'toolbox@market': [{ scope: 'user', version: '2.0.0', installedAt: '2026-08-04T10:47:50.308Z' }],
        'extras@market': [{ scope: 'project', version: '1.0.0' }]
      }
    })
  )
  writeSkillMd(join(configRoot, 'plugins', 'cache', 'market', 'toolbox', '2.0.0', 'skills', 'core', 'alpha'))
  writeSkillMd(join(configRoot, 'plugins', 'cache', 'market', 'toolbox', '2.0.0', 'skills', 'deprecated', 'old-thing'))
  writeSkillMd(join(configRoot, 'plugins', 'cache', 'market', 'extras', '1.0.0', 'skills', 'solo'))

  mkdirSync(join(configRoot, 'plugins', 'marketplaces', 'market', '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(configRoot, 'plugins', 'marketplaces', 'market', '.claude-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'market',
      plugins: [
        { name: 'toolbox', description: 'Toolbox plugin.' },
        { name: 'old-plugin', description: 'Old plugin, since removed.' }
      ]
    })
  )

  mkdirSync(join(workdir, '.claude'), { recursive: true })
  writeFileSync(
    join(workdir, '.claude', 'settings.local.json'),
    JSON.stringify({ enabledPlugins: { 'toolbox@market': false } })
  )

  db = openLedgerDb(':memory:')
  const insertTurn = db.prepare(
    'INSERT INTO turns (session_id, uuid, ts, model, input_tokens, output_tokens, attribution_plugin) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  insertTurn.run('sess-1', 't-1', T_OLD, 'claude-sonnet-4-6', 10, 5, 'toolbox')
  insertTurn.run('sess-1', 't-2', T_NEW, 'claude-sonnet-4-6', 10, 5, 'toolbox')
  insertTurn.run('sess-1', 't-3', T_OLD, 'claude-sonnet-4-6', 10, 5, 'old-plugin') // bare name joins the @market row
  insertTurn.run('sess-1', 't-4', T_OLD, 'claude-sonnet-4-6', 10, 5, null)
})

afterEach(() => {
  db.close()
  rmSync(configRoot, { recursive: true, force: true })
  rmSync(workdir, { recursive: true, force: true })
})

describe('listPlugins', () => {
  it('lists installed plugins with install metadata, bundled-skill counts and catalog descriptions', () => {
    const { plugins } = listPlugins(configRoot, db)

    const toolbox = plugins.find((p) => p.name === 'toolbox')!
    expect(toolbox).toEqual({
      key: 'toolbox@market',
      name: 'toolbox',
      marketplace: 'market',
      installed: true,
      version: '2.0.0',
      scope: 'user',
      installedAt: '2026-08-04T10:47:50.308Z',
      skillCount: 2, // alpha + deprecated old-thing
      description: 'Toolbox plugin.',
      usageCount: 3,
      lastUsedAtMs: 5000,
      ledgerTurns: 2,
      ledgerLastTs: T_NEW,
      enabled: true,
      overriddenInProjects: 1 // workdir flips toolbox@market off
    })

    const extras = plugins.find((p) => p.name === 'extras')!
    expect(extras.installed).toBe(true)
    expect(extras.scope).toBe('project')
    expect(extras.skillCount).toBe(1)
    expect(extras.description).toBeNull() // catalog exists but has no extras entry
    expect(extras.usageCount).toBeNull() // never in pluginUsage
    expect(extras.enabled).toBe(false)
    expect(extras.overriddenInProjects).toBe(0)
  })

  it('keeps uninstalled plugins as historical rows with their lifetime counters', () => {
    const { plugins } = listPlugins(configRoot, db)

    const old = plugins.find((p) => p.name === 'old-plugin')!
    expect(old.installed).toBe(false)
    expect(old.version).toBeNull()
    expect(old.skillCount).toBe(0)
    expect(old.usageCount).toBe(7)
    expect(old.lastUsedAtMs).toBe(4000)
    expect(old.description).toBe('Old plugin, since removed.') // catalog still describes it
    expect(old.ledgerTurns).toBe(1) // bare attribution name joins in
    expect(old.enabled).toBeNull()

    const gone = plugins.find((p) => p.name === 'gone-plugin')!
    expect(gone.installed).toBe(false)
    expect(gone.marketplace).toBe('nowhere')
    expect(gone.description).toBeNull() // that marketplace has no catalog file
    expect(gone.usageCount).toBe(1)
  })

  it('sorts installed rows first, then by newest activity, and works without a Ledger', () => {
    const withDb = listPlugins(configRoot, db).plugins
    expect(withDb.map((p) => p.name)).toEqual(['toolbox', 'extras', 'old-plugin', 'gone-plugin'])

    const withoutDb = listPlugins(configRoot, null).plugins
    expect(withoutDb.find((p) => p.name === 'toolbox')!.ledgerTurns).toBe(0)
    expect(withoutDb.find((p) => p.name === 'old-plugin')!.usageCount).toBe(7) // pluginUsage survives without the Ledger
  })
})
