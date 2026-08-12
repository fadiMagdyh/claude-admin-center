import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SkillsResponse } from 'shared'
import { app } from '../app.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'config-root')
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalLedgerDbPath = process.env.LEDGER_DB_PATH

describe('GET /api/skills', () => {
  beforeAll(() => {
    process.env.CLAUDE_CONFIG_DIR = fixtureRoot
    process.env.LEDGER_DB_PATH = ':memory:' // empty Ledger → zero attribution, route still answers
  })
  afterAll(() => {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    if (originalLedgerDbPath === undefined) delete process.env.LEDGER_DB_PATH
    else process.env.LEDGER_DB_PATH = originalLedgerDbPath
  })

  it('assembles the unified skill list from the fixture config root', async () => {
    const res = await app.request('/api/skills')
    expect(res.status).toBe(200)
    const body = (await res.json()) as SkillsResponse

    // Installed version 1.2.3 only — the cached 1.2.0 stale-skill must not appear.
    expect(body.skills.map((s) => s.name).sort()).toEqual(['fixture-ghost', 'fixture-skill', 'retired-skill'])

    const skill = body.skills.find((s) => s.name === 'fixture-skill')!
    expect(skill).toEqual({
      key: 'plugin:mattpocock-skills:fixture-skill',
      name: 'fixture-skill',
      source: 'plugin',
      status: 'normal',
      ghost: false,
      plugin: 'mattpocock-skills',
      projectPath: null,
      description: 'A fixture skill for the skills reader tests.',
      usageCount: 5,
      lastUsedAtMs: 1786550000000,
      ledgerTurns: 0,
      ledgerLastTs: null,
      enabled: null, // fixture settings.json has no entry for mattpocock-skills
      overriddenInProjects: 0
    })

    const retired = body.skills.find((s) => s.name === 'retired-skill')!
    expect(retired.status).toBe('deprecated')

    const ghost = body.skills.find((s) => s.name === 'fixture-ghost')!
    expect(ghost.source).toBe('built-in')
    expect(ghost.ghost).toBe(true)
    expect(ghost.usageCount).toBe(2)
  })
})
