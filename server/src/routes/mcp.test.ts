import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { McpServersResponse } from 'shared'
import { app } from '../app.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'config-root')
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR

describe('GET /api/mcp', () => {
  beforeAll(() => {
    process.env.CLAUDE_CONFIG_DIR = fixtureRoot
  })
  afterAll(() => {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  })

  it('serves the unified MCP Server list from the fixture config root', async () => {
    const res = await app.request('/api/mcp')
    expect(res.status).toBe(200)
    const body = (await res.json()) as McpServersResponse

    expect(body.localCount).toBe(1)
    expect(body.managedCount).toBe(2)
    expect(body.servers.map((s) => s.key)).toEqual([
      'local:github',
      'managed:claude.ai Fixture Board',
      'managed:claude.ai Fixture Docs'
    ])

    const github = body.servers.find((s) => s.name === 'github')!
    expect(github.provenance).toBe('local')
    expect(github.commandSummary).toBe('npx -y')
    expect(github.definedInProjects).toEqual(['alpha'])
    expect(github.disabledInProjects).toBe(0)

    const board = body.servers.find((s) => s.name === 'claude.ai Fixture Board')!
    expect(board.provenance).toBe('managed')
    expect(board.lastAuthMs).toBe(1786447804779)
    expect(board.managedId).toBe('mcpsrv_fixtureBoard')
    expect(board.everConnected).toBe(true)

    const docs = body.servers.find((s) => s.name === 'claude.ai Fixture Docs')!
    expect(docs.everConnected).toBe(false)
    expect(docs.managedId).toBeNull()
  })
})
