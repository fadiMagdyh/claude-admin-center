import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { OverviewResponse } from 'shared'
import { app } from '../app.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'config-root')
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR

describe('GET /api/overview', () => {
  beforeAll(() => {
    process.env.CLAUDE_CONFIG_DIR = fixtureRoot
  })
  afterAll(() => {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  })

  it('assembles the overview from the fixture config root', async () => {
    const res = await app.request('/api/overview')
    expect(res.status).toBe(200)
    const body = (await res.json()) as OverviewResponse

    expect(body.configRoot).toBe(fixtureRoot)

    expect(body.projects.count).toBe(3)
    expect(body.projects.topByLastCost).toEqual([
      { name: 'beta', path: 'D:/fixture/beta', lastCost: 9.25, lastSessionId: 'sid-beta' },
      { name: 'alpha', path: 'D:/fixture/alpha', lastCost: 2.5, lastSessionId: 'sid-alpha' }
    ])

    expect(body.systems).toEqual([
      { name: 'github', kind: 'mcp-local', on: true, status: 'CONFIGURED' },
      { name: 'mattpocock-skills', kind: 'plugin', on: true, status: '1.2.3' },
      { name: 'ledger', kind: 'ledger', on: false, status: 'OFFLINE' }
    ])

    expect(body.activity).toEqual([
      { display: 'newest prompt', timestamp: 1786552000000, project: 'alpha' },
      { display: 'middle prompt', timestamp: 1786551000000, project: 'beta' },
      { display: 'oldest prompt', timestamp: 1786550000000, project: 'alpha' }
    ])

    expect(body.spend14d).toBeNull()
    expect(body.tokens14d).toBeNull()
    expect(body.sessions14d).toBeNull()
    expect(body.cachePct).toBeNull()
  })
})
