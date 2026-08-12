import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectsResponse } from 'shared'
import { Projects } from './Projects'

const projectsResponse: ProjectsResponse = {
  registryCount: 2,
  orphanCount: 1,
  liveCount: 1,
  projects: [
    {
      name: 'alpha',
      path: 'D:/fixture/alpha',
      orphaned: false,
      onDisk: true,
      live: true,
      lastCost: 2.5,
      lastSessionId: 'sid-alpha',
      lastActiveMs: Date.now() - 7_200_000,
      lastTokens: 1000,
      mcpServerCount: 1,
      enabledPluginCount: 2,
      ledger30d: { sessions: 4, tokens: 1_500_000, costUsd: 12.34, unpricedTurns: 0 }
    },
    {
      name: 'beta',
      path: 'D:/fixture/beta',
      orphaned: false,
      onDisk: false,
      live: false,
      lastCost: null,
      lastSessionId: null,
      lastActiveMs: null,
      lastTokens: null,
      mcpServerCount: 0,
      enabledPluginCount: 0,
      ledger30d: { sessions: 0, tokens: 0, costUsd: null, unpricedTurns: 0 }
    },
    {
      name: 'D--fixture-orphan',
      path: 'D--fixture-orphan',
      orphaned: true,
      onDisk: true,
      live: false,
      lastCost: null,
      lastSessionId: null,
      lastActiveMs: null,
      lastTokens: null,
      mcpServerCount: 0,
      enabledPluginCount: 0,
      ledger30d: null
    }
  ]
}

function renderProjects() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(projectsResponse) })
  )
  return render(
    <MemoryRouter initialEntries={['/projects']}>
      <Projects />
    </MemoryRouter>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Projects', () => {
  it('renders a row per project with badges and Ledger stats', async () => {
    renderProjects()
    expect(await screen.findByText('alpha')).toBeDefined()
    expect(screen.getByText('beta')).toBeDefined()
    expect(screen.getByText('D--fixture-orphan')).toBeDefined()
    expect(screen.getByText('orphaned')).toBeDefined()
    expect(screen.getByText('live')).toBeDefined()
    expect(screen.getByText('$12.34')).toBeDefined()
  })

  it('opens the advisor panel targeted at the clicked project', async () => {
    renderProjects()
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Claude about alpha' }))
    expect(screen.getByText('ADVISOR // ALPHA')).toBeDefined()
    expect(screen.getByText(/project · D:\/fixture\/alpha/)).toBeDefined()
  })
})
