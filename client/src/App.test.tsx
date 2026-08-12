import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OverviewResponse } from 'shared'
import App from './App'

const overview: OverviewResponse = {
  configRoot: 'D:\\fixture-config',
  projects: { count: 3, topByLastCost: [] },
  systems: [{ name: 'ledger', kind: 'ledger', on: false, status: 'OFFLINE' }],
  activity: [],
  spend14d: null,
  tokens14d: null,
  sessions14d: null,
  cachePct: null,
  models: []
}

function renderApp() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(overview) })
  )
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders the shell with the dock nav sections', () => {
    renderApp()
    expect(screen.getByRole('link', { name: 'CLAUDE ADMIN CENTER' })).toBeDefined()
    for (const section of ['Projects', 'Sessions', 'Usage', 'Models', 'Skills', 'Plugins', 'MCP Servers', 'Activity']) {
      expect(screen.getByRole('link', { name: section })).toBeDefined()
    }
  })

  it('shows the config root from the API in the topbar', async () => {
    renderApp()
    expect(await screen.findByText(/D:\\fixture-config/)).toBeDefined()
  })

  it('renders the landing gauge offline until the ledger lands', () => {
    renderApp()
    expect(screen.getByText('LEDGER OFFLINE')).toBeDefined()
  })
})
