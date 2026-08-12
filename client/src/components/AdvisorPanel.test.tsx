import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdvisorHistoryResponse } from 'shared'
import { AdvisorPanel } from './AdvisorPanel'

const okHistory: AdvisorHistoryResponse = {
  runs: [
    {
      runId: 'run-1',
      objectType: 'model',
      objectKey: 'claude-fable-5',
      model: 'haiku',
      status: 'ok',
      requestedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      costUsd: 0.0042,
      error: null,
      summary: 'Model usage looks sane.',
      recommendations: [
        { severity: 'warning', finding: 'Cache hit-rate is low', action: 'Enable prompt caching' },
        { severity: 'info', finding: 'Spend is modest', action: 'No action needed' }
      ],
      latest: true
    }
  ],
  inputUnchanged: true
}

const queuedHistory: AdvisorHistoryResponse = {
  runs: [{ ...okHistory.runs[0], runId: 'run-2', status: 'queued', costUsd: null, summary: null, recommendations: [] }],
  inputUnchanged: false
}

function mockFetch(history: AdvisorHistoryResponse) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(init?.method === 'POST' ? { runId: 'run-new' } : history)
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const target = { objectType: 'model', objectKey: 'claude-fable-5', title: 'claude-fable-5' }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdvisorPanel', () => {
  it('renders the latest run: summary, severity-badged cards, estimated cost, unchanged badge', async () => {
    mockFetch(okHistory)
    render(<AdvisorPanel target={target} onClose={() => {}} />)

    expect(await screen.findByText('Model usage looks sane.')).toBeDefined()
    expect(screen.getByText('warning')).toBeDefined()
    expect(screen.getByText('Cache hit-rate is low')).toBeDefined()
    expect(screen.getByText('Enable prompt caching')).toBeDefined()
    expect(screen.getByText('info')).toBeDefined()
    expect(screen.getByText(/est\. \$0\.0042/)).toBeDefined()
    expect(screen.getByText('input unchanged since last run')).toBeDefined()
  })

  it('starts a run with the selected model when ASK CLAUDE is clicked', async () => {
    const fetchMock = mockFetch(okHistory)
    render(<AdvisorPanel target={target} onClose={() => {}} />)
    await screen.findByText('Model usage looks sane.')

    fireEvent.click(screen.getByRole('button', { name: 'sonnet' }))
    fireEvent.click(screen.getByRole('button', { name: /ask claude/i }))

    const post = await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      expect(call).toBeDefined()
      return call!
    })
    expect(post[0]).toBe('/api/advisor/runs')
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      objectType: 'model',
      objectKey: 'claude-fable-5',
      model: 'sonnet'
    })
  })

  it('shows the in-flight state with a cancel button that POSTs the cancel', async () => {
    const fetchMock = mockFetch(queuedHistory)
    render(<AdvisorPanel target={target} onClose={() => {}} />)

    expect(await screen.findByText(/RUN QUEUED · haiku/)).toBeDefined()
    expect((screen.getByRole('button', { name: /ask claude/i }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/advisor/runs/run-2/cancel', { method: 'POST' })
    })
  })

  it('targets the overview object for the full sweep when no target is passed', async () => {
    const fetchMock = mockFetch({ runs: [], inputUnchanged: false })
    render(<AdvisorPanel onClose={() => {}} />)

    expect(screen.getByText('ADVISOR // FULL SWEEP')).toBeDefined()
    expect(await screen.findByText(/NO ADVISOR RUNS YET/)).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/advisor/runs?objectType=overview&objectKey=overview')
  })
})
