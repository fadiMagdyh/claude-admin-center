import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpServersResponse } from 'shared'
import { McpServers } from './McpServers'

const response: McpServersResponse = {
  localCount: 1,
  managedCount: 2,
  servers: [
    {
      key: 'local:browser', name: 'browser', provenance: 'local',
      commandSummary: 'npx -y', definedInProjects: ['alpha', 'beta'], disabledInProjects: 1,
      lastAuthMs: null, managedId: null, everConnected: false
    },
    {
      key: 'managed:claude.ai Whiteboard', name: 'claude.ai Whiteboard', provenance: 'managed',
      commandSummary: null, definedInProjects: [], disabledInProjects: 0,
      lastAuthMs: Date.now() - 3_600_000, managedId: 'mcpsrv_x1', everConnected: true
    },
    {
      key: 'managed:claude.ai Retired Tool', name: 'claude.ai Retired Tool', provenance: 'managed',
      commandSummary: null, definedInProjects: [], disabledInProjects: 0,
      lastAuthMs: null, managedId: null, everConnected: false
    }
  ]
}

function renderMcpServers() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })
  vi.stubGlobal('fetch', fetchMock)
  render(<McpServers />)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('McpServers', () => {
  it('renders the unified list with provenance badges and per-provenance detail', async () => {
    const fetchMock = renderMcpServers()
    expect(await screen.findByText('browser')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/mcp')

    expect(screen.getByText('local')).toBeDefined()
    expect(screen.getAllByText('managed')).toHaveLength(2)
    expect(screen.getByText('— 1 local · 2 managed')).toBeDefined()

    // Local detail: command summary + defining projects, disable summary.
    expect(screen.getByText(/npx -y/)).toBeDefined()
    expect(screen.getByText(/in 2 projects: alpha, beta/)).toBeDefined()
    expect(screen.getByText('disabled in 1 of 2 defining projects')).toBeDefined()

    // Managed detail: connected-ever badges.
    expect(screen.getByText('connected')).toBeDefined()
    expect(screen.getByText('never connected')).toBeDefined()
  })

  it('opens the AdvisorPanel targeted at "<provenance>:<name>"', async () => {
    renderMcpServers()
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Claude about claude.ai Whiteboard' }))
    expect(screen.getByText('ADVISOR // CLAUDE.AI WHITEBOARD')).toBeDefined()
    expect(screen.getByText('TARGET · mcp · managed:claude.ai Whiteboard')).toBeDefined()
  })
})
