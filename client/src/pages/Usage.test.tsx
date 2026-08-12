import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UsageResponse } from 'shared'
import { Usage } from './Usage'

const response: UsageResponse = {
  range: '14',
  tiles: { costUsd: 12.34, unpricedTurns: 2, tokens: 1_500_000, sessions: 9, cachePct: 61, historyDays: 42 },
  days: [
    { day: '2026-08-10', perModel: [{ model: 'claude-fable-5', cost: 3, unpricedTurns: 0 }], total: 3 },
    {
      day: '2026-08-11',
      perModel: [
        { model: 'claude-fable-5', cost: 1.5, unpricedTurns: 0 },
        { model: 'claude-sonnet-4-6', cost: 0.5, unpricedTurns: 2 }
      ],
      total: 2
    }
  ],
  models: [
    {
      model: 'claude-fable-5', longContext: true, turns: 12, inputTokens: 1000, outputTokens: 200,
      cacheRead: 500, cacheWrite: 300, tokens: 2000, costUsd: 4.5, unpricedTurns: 0
    },
    {
      model: 'claude-sonnet-4-6', longContext: false, turns: 5, inputTokens: 400, outputTokens: 100,
      cacheRead: 0, cacheWrite: 0, tokens: 500, costUsd: 0.5, unpricedTurns: 2
    }
  ],
  unpriced: { turns: 2, models: ['claude-sonnet-4-6'] }
}

function renderUsage() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })
  vi.stubGlobal('fetch', fetchMock)
  render(<Usage />)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Usage', () => {
  it('renders the stat tiles with the Unpriced policy and the Ledger span', async () => {
    renderUsage()
    expect(await screen.findByText('≥ $12.34')).toBeDefined()
    expect(screen.getByText('+ 2 unpriced turns')).toBeDefined()
    expect(screen.getByText('1.5M')).toBeDefined()
    expect(screen.getByText('61% cache reads')).toBeDefined()
    expect(screen.getByText('42 days')).toBeDefined()
  })

  it('renders the stacked chart with a legend and by-model bars with direct labels', async () => {
    renderUsage()
    expect(await screen.findByRole('img', { name: 'Daily spend by model over 2 days' })).toBeDefined()
    expect(screen.getAllByText('claude-fable-5').length).toBeGreaterThanOrEqual(2) // legend chip + hbar row
    expect(screen.getAllByText('incl. [1m]').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('$4.50')).toBeDefined() // fable direct label
    expect(screen.getByText('≥ $0.50 + 2 unpriced')).toBeDefined() // sonnet direct label
  })

  it('toggles the chart to the same data as a table', async () => {
    renderUsage()
    fireEvent.click(await screen.findByRole('button', { name: 'Table' }))
    expect(screen.getByText('Total')).toBeDefined()
    expect(screen.getAllByText('$3.00')).toHaveLength(2) // fable cell + day total
    expect(screen.getByText('≥ $2.00 + 2 unpriced')).toBeDefined() // Unpriced policy in the total column
    expect(screen.getByRole('button', { name: 'Chart' })).toBeDefined()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('refetches when a range pill is clicked', async () => {
    const fetchMock = renderUsage()
    expect(await screen.findByText('≥ $12.34')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/usage?range=14')
    fireEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/usage?range=7')
  })
})
