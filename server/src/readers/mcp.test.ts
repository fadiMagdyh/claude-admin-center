import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listMcpServers } from './mcp.js'

let configRoot: string

beforeEach(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'mcp-config-'))
  writeFileSync(
    join(configRoot, '.claude.json'),
    JSON.stringify({
      projects: {
        'D:/work/alpha': {
          mcpServers: {
            browser: {
              type: 'stdio',
              command: 'npx',
              args: ['-y', 'browser-mcp'],
              env: { API_TOKEN: 'super-secret-value' }
            }
          }
        },
        'D:/work/beta': {
          mcpServers: {
            browser: { type: 'stdio', command: 'npx', args: ['-y', 'browser-mcp'] },
            tracker: { type: 'stdio', command: 'cmd', args: ['/c', 'npx', 'tracker-mcp'] }
          },
          disabledMcpServers: ['browser'],
          disabledMcpjsonServers: ['tracker']
        },
        'D:/work/gamma': {}
      },
      claudeAiMcpEverConnected: ['claude.ai Whiteboard', 'claude.ai Retired Tool']
    })
  )
  writeFileSync(
    join(configRoot, 'mcp-needs-auth-cache.json'),
    JSON.stringify({
      'claude.ai Whiteboard': { timestamp: 1786447804779, id: 'mcpsrv_fixture01' },
      'claude.ai Notes': { timestamp: 1786000000000 }
    })
  )
})

afterEach(() => {
  rmSync(configRoot, { recursive: true, force: true })
})

describe('listMcpServers', () => {
  it('dedupes local stdio definitions across projects with disable counts', () => {
    const { servers, localCount } = listMcpServers(configRoot)
    expect(localCount).toBe(2)

    const browser = servers.find((s) => s.name === 'browser')!
    expect(browser).toEqual({
      key: 'local:browser',
      name: 'browser',
      provenance: 'local',
      commandSummary: 'npx -y',
      definedInProjects: ['alpha', 'beta'],
      disabledInProjects: 1, // beta's disabledMcpServers
      lastAuthMs: null,
      managedId: null,
      everConnected: false
    })

    const tracker = servers.find((s) => s.name === 'tracker')!
    expect(tracker.definedInProjects).toEqual(['beta'])
    expect(tracker.disabledInProjects).toBe(1) // beta's disabledMcpjsonServers
    expect(tracker.commandSummary).toBe('cmd /c')
  })

  it('never surfaces env values or full args in the command summary', () => {
    const serialized = JSON.stringify(listMcpServers(configRoot))
    expect(serialized).not.toContain('super-secret-value')
    expect(serialized).not.toContain('API_TOKEN')
    expect(serialized).not.toContain('browser-mcp') // args beyond the first stay out too
  })

  it('joins the managed auth cache with the ever-connected list', () => {
    const { servers, managedCount } = listMcpServers(configRoot)
    expect(managedCount).toBe(3)

    const whiteboard = servers.find((s) => s.name === 'claude.ai Whiteboard')!
    expect(whiteboard).toEqual({
      key: 'managed:claude.ai Whiteboard',
      name: 'claude.ai Whiteboard',
      provenance: 'managed',
      commandSummary: null,
      definedInProjects: [],
      disabledInProjects: 0,
      lastAuthMs: 1786447804779,
      managedId: 'mcpsrv_fixture01',
      everConnected: true
    })

    const notes = servers.find((s) => s.name === 'claude.ai Notes')!
    expect(notes.managedId).toBeNull() // cache entry without an id
    expect(notes.everConnected).toBe(false)

    // In everConnected but missing from the auth cache — still gets a row.
    const retired = servers.find((s) => s.name === 'claude.ai Retired Tool')!
    expect(retired.lastAuthMs).toBeNull()
    expect(retired.managedId).toBeNull()
    expect(retired.everConnected).toBe(true)
  })

  it('lists local rows before managed rows, each sorted by name', () => {
    const { servers } = listMcpServers(configRoot)
    expect(servers.map((s) => s.name)).toEqual([
      'browser',
      'tracker',
      'claude.ai Notes',
      'claude.ai Retired Tool',
      'claude.ai Whiteboard'
    ])
  })

  it('returns an empty list when the config root has no MCP state', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'mcp-empty-'))
    try {
      expect(listMcpServers(emptyRoot)).toEqual({ localCount: 0, managedCount: 0, servers: [] })
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true })
    }
  })
})
