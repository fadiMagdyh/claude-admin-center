import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProjectDetailResponse, ProjectsResponse } from 'shared'
import { app } from '../app.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'config-root')
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalLedgerDbPath = process.env.LEDGER_DB_PATH

beforeAll(() => {
  process.env.CLAUDE_CONFIG_DIR = fixtureRoot
  process.env.LEDGER_DB_PATH = ':memory:' // empty Ledger → zeroed 30d stats
})
afterAll(() => {
  process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  if (originalLedgerDbPath === undefined) delete process.env.LEDGER_DB_PATH
  else process.env.LEDGER_DB_PATH = originalLedgerDbPath
})

describe('GET /api/projects', () => {
  it('lists Registry projects joined with disk state plus the Orphaned Project', async () => {
    const res = await app.request('/api/projects')
    expect(res.status).toBe(200)
    const body = (await res.json()) as ProjectsResponse

    expect(body.registryCount).toBe(3)
    expect(body.orphanCount).toBe(1)
    expect(body.liveCount).toBe(1)
    expect(body.projects).toHaveLength(4)

    const alpha = body.projects.find((p) => p.path === 'D:/fixture/alpha')!
    expect(alpha.name).toBe('alpha')
    expect(alpha.onDisk).toBe(true)
    expect(alpha.mcpServerCount).toBe(1)
    expect(alpha.ledger30d).toEqual({ sessions: 0, tokens: 0, costUsd: null, unpricedTurns: 0 })

    const beta = body.projects.find((p) => p.path === 'D:/fixture/beta')!
    expect(beta.live).toBe(true)
    expect(beta.onDisk).toBe(false)
    expect(beta.lastCost).toBe(9.25)

    const orphan = body.projects.find((p) => p.orphaned)!
    expect(orphan.name).toBe('D--fixture-orphan')
  })
})

describe('GET /api/projects/detail', () => {
  it('returns the project detail for a Registry cwd', async () => {
    const res = await app.request(`/api/projects/detail?cwd=${encodeURIComponent('D:/fixture/alpha')}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as ProjectDetailResponse

    expect(body.project.path).toBe('D:/fixture/alpha')
    expect(body.sessions).toEqual([])
    expect(body.enablement).toEqual([
      { name: 'fixture-skills', kind: 'plugin', on: true, scope: 'global' },
      { name: 'fixture-lint', kind: 'plugin', on: false, scope: 'global' },
      { name: 'github', kind: 'mcp', on: true, scope: 'this project' }
    ])
    expect(body.memory).toEqual({
      hasMemoryMd: true,
      fileCount: 1,
      lastModifiedMs: expect.any(Number)
    })
  })

  it('rejects a missing cwd param and an unknown cwd', async () => {
    expect((await app.request('/api/projects/detail')).status).toBe(400)
    expect((await app.request(`/api/projects/detail?cwd=${encodeURIComponent('D:/nope')}`)).status).toBe(404)
  })
})
