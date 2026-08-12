import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginsResponse } from 'shared'
import { Plugins } from './Plugins'

const response: PluginsResponse = {
  plugins: [
    {
      key: 'mattpocock-skills@claude-plugins-official', name: 'mattpocock-skills', marketplace: 'claude-plugins-official',
      installed: true, version: '1.2.3', scope: 'user', installedAt: '2026-08-04T10:47:50.308Z',
      skillCount: 12, description: 'Engineering skills.',
      usageCount: 33, lastUsedAtMs: Date.now() - 3_600_000, ledgerTurns: 620, ledgerLastTs: '2026-08-11T10:00:00.000Z',
      enabled: true, overriddenInProjects: 2
    },
    {
      key: 'superpowers@claude-plugins-official', name: 'superpowers', marketplace: 'claude-plugins-official',
      installed: false, version: null, scope: null, installedAt: null,
      skillCount: 0, description: null,
      usageCount: 107, lastUsedAtMs: Date.now() - 86_400_000 * 20, ledgerTurns: 1727, ledgerLastTs: '2026-07-20T10:00:00.000Z',
      enabled: null, overriddenInProjects: 0
    }
  ]
}

function renderPlugins() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })
  vi.stubGlobal('fetch', fetchMock)
  render(<Plugins />)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Plugins', () => {
  it('renders installed and uninstalled rows with ghost styling and enablement', async () => {
    const fetchMock = renderPlugins()
    expect(await screen.findByText('mattpocock-skills')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/plugins')

    expect(screen.getByText('installed')).toBeDefined()
    expect(screen.getByText('uninstalled')).toBeDefined()
    expect(screen.getByText('superpowers').closest('tr')?.className).toBe('ghost')
    expect(screen.getByText('1.2.3')).toBeDefined()
    expect(screen.getByText('620')).toBeDefined() // Ledger turns
    expect(screen.getByText('overridden in 2 projects')).toBeDefined()
  })

  it('opens the AdvisorPanel targeted at the plugin key', async () => {
    renderPlugins()
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Claude about mattpocock-skills' }))
    expect(screen.getByText('ADVISOR // MATTPOCOCK-SKILLS')).toBeDefined()
    expect(screen.getByText('TARGET · plugin · mattpocock-skills@claude-plugins-official')).toBeDefined()
  })
})
