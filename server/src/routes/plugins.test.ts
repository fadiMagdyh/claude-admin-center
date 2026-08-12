import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PluginsResponse } from 'shared'
import { app } from '../app.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'config-root')
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalLedgerDbPath = process.env.LEDGER_DB_PATH

describe('GET /api/plugins', () => {
  beforeAll(() => {
    process.env.CLAUDE_CONFIG_DIR = fixtureRoot
    process.env.LEDGER_DB_PATH = ':memory:' // empty Ledger → zero attribution, route still answers
  })
  afterAll(() => {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    if (originalLedgerDbPath === undefined) delete process.env.LEDGER_DB_PATH
    else process.env.LEDGER_DB_PATH = originalLedgerDbPath
  })

  it('assembles installed and historical plugin rows from the fixture config root', async () => {
    const res = await app.request('/api/plugins')
    expect(res.status).toBe(200)
    const body = (await res.json()) as PluginsResponse

    expect(body.plugins.map((p) => p.name)).toEqual(['mattpocock-skills', 'retired-plugin'])

    const installed = body.plugins.find((p) => p.name === 'mattpocock-skills')!
    expect(installed).toEqual({
      key: 'mattpocock-skills@claude-plugins-official',
      name: 'mattpocock-skills',
      marketplace: 'claude-plugins-official',
      installed: true,
      version: '1.2.3',
      scope: 'user',
      installedAt: '2026-08-04T10:47:50.308Z',
      skillCount: 2, // fixture-skill + retired-skill in the installed 1.2.3 cache
      description: 'Fixture catalog description for mattpocock-skills.',
      usageCount: 9,
      lastUsedAtMs: 1786552000000,
      ledgerTurns: 0,
      ledgerLastTs: null,
      enabled: null, // fixture settings.json has no entry for mattpocock-skills
      overriddenInProjects: 0
    })

    const retired = body.plugins.find((p) => p.name === 'retired-plugin')!
    expect(retired.installed).toBe(false)
    expect(retired.usageCount).toBe(4)
    expect(retired.description).toBe('A fixture plugin that was uninstalled.')
  })
})
