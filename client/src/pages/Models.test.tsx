import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelsResponse } from 'shared'
import { Models } from './Models'

const response: ModelsResponse = {
  range: 'all',
  pinnedModel: 'claude-fable-5',
  models: [
    {
      model: 'claude-fable-5', longContext: true, pinnedDefault: true,
      firstTs: '2026-03-12T10:00:00.000Z', lastTs: '2026-08-11T10:00:00.000Z',
      turns: 42, sessions: 7, inputTokens: 1000, outputTokens: 200, cacheRead: 500, cacheWrite: 300,
      tokens: 2000, costUsd: 4.5, unpricedTurns: 0,
      price: { input: 10, output: 50, cacheRead: 1 }
    },
    {
      model: 'mystery-model-9', longContext: false, pinnedDefault: false,
      firstTs: '2026-08-01T10:00:00.000Z', lastTs: '2026-08-01T10:05:00.000Z',
      turns: 3, sessions: 1, inputTokens: 50, outputTokens: 5, cacheRead: 0, cacheWrite: 0,
      tokens: 55, costUsd: null, unpricedTurns: 3,
      price: null
    }
  ],
  unpriced: { turns: 3, models: ['mystery-model-9'] }
}

function renderModels() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })
  vi.stubGlobal('fetch', fetchMock)
  render(<Models />)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Models', () => {
  it('renders one row per base Model with badges and price columns', async () => {
    renderModels()
    expect(await screen.findByText('claude-fable-5')).toBeDefined()
    expect(screen.getByText('incl. [1m]')).toBeDefined()
    expect(screen.getByText('pinned default')).toBeDefined()
    expect(screen.getByText('$10 · $50')).toBeDefined()
    expect(screen.getByText('$4.50')).toBeDefined()
    expect(screen.getByText('2.0K')).toBeDefined()
  })

  it('shows the Unpriced policy: badge, dash price and the summary note', async () => {
    renderModels()
    expect(await screen.findByText('mystery-model-9')).toBeDefined()
    expect(screen.getByText('unpriced')).toBeDefined()
    expect(screen.getByText('—')).toBeDefined() // no current price entry
    expect(screen.getByText(/UNPRICED: 3 TURNS \(mystery-model-9\)/)).toBeDefined()
  })

  it('offers an Ask Claude button per row and refetches when a range pill is clicked', async () => {
    const fetchMock = renderModels()
    expect(await screen.findByRole('button', { name: 'Ask Claude about claude-fable-5' })).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/models?range=all')
    fireEvent.click(screen.getByRole('button', { name: '30d' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/models?range=30')
  })

  it('opens the AdvisorPanel targeted at the base Model', async () => {
    renderModels()
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Claude about claude-fable-5' }))
    expect(screen.getByText('ADVISOR // CLAUDE-FABLE-5')).toBeDefined()
    expect(screen.getByText('TARGET · model · claude-fable-5')).toBeDefined()
  })
})
