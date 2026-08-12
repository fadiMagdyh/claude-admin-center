import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ActivityResponse } from 'shared'
import { app } from '../app.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'config-root')
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR

describe('GET /api/activity', () => {
  beforeAll(() => {
    process.env.CLAUDE_CONFIG_DIR = fixtureRoot
  })
  afterAll(() => {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  })

  it('lists the fixture history newest first with normalized project paths', async () => {
    const res = await app.request('/api/activity')
    expect(res.status).toBe(200)
    const body = (await res.json()) as ActivityResponse

    expect(body.total).toBe(3)
    expect(body.entries).toEqual([
      {
        display: 'newest prompt',
        timestamp: 1786552000000,
        project: 'D:/fixture/alpha',
        projectName: 'alpha',
        sessionId: 'sid-alpha'
      },
      {
        display: 'middle prompt',
        timestamp: 1786551000000,
        project: 'D:/fixture/beta',
        projectName: 'beta',
        sessionId: 'sid-beta'
      },
      {
        display: 'oldest prompt',
        timestamp: 1786550000000,
        project: 'D:/fixture/alpha',
        projectName: 'alpha',
        sessionId: 'sid-alpha'
      }
    ])
  })

  it('caps entries at limit and filters by project', async () => {
    const limited = (await (await app.request('/api/activity?limit=1')).json()) as ActivityResponse
    expect(limited.total).toBe(3)
    expect(limited.entries).toHaveLength(1)
    expect(limited.entries[0].display).toBe('newest prompt')

    const filtered = (await (
      await app.request(`/api/activity?project=${encodeURIComponent('D:/fixture/beta')}`)
    ).json()) as ActivityResponse
    expect(filtered.total).toBe(1)
    expect(filtered.entries[0].display).toBe('middle prompt')
  })

  it('rejects a non-positive or non-numeric limit', async () => {
    expect((await app.request('/api/activity?limit=0')).status).toBe(400)
    expect((await app.request('/api/activity?limit=abc')).status).toBe(400)
  })
})
