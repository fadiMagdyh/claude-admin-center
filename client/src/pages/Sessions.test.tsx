import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDetailResponse, SessionRow, SessionsResponse } from 'shared'
import { Sessions } from './Sessions'

const liveSession: SessionRow = {
  sessionId: 'sess-live',
  title: 'Build the sessions section',
  projectName: 'admin-center',
  cwd: 'D:/fixture/admin-center',
  live: true,
  transcriptGone: false,
  firstTs: new Date(Date.now() - 9_000_000).toISOString(),
  lastTs: new Date(Date.now() - 7_200_000).toISOString(),
  durationMs: 1_800_000,
  agentRuns: 2,
  turns: 40,
  tokens: 1_500_000,
  costUsd: 12.34,
  unpricedTurns: 0,
  models: ['claude-sonnet-4-6']
}

const goneSession: SessionRow = {
  sessionId: 'sess-gone',
  title: null,
  projectName: null,
  cwd: null,
  live: false,
  transcriptGone: true,
  firstTs: null,
  lastTs: null,
  durationMs: null,
  agentRuns: 0,
  turns: 3,
  tokens: 900,
  costUsd: null,
  unpricedTurns: 3,
  models: ['mystery-model-9']
}

const sessionsResponse: SessionsResponse = {
  total: 2,
  liveCount: 1,
  ledgerOnlyCount: 1,
  sessions: [liveSession, goneSession]
}

const detailResponse: SessionDetailResponse = {
  session: liveSession,
  models: [{ model: 'claude-sonnet-4-6', turns: 40, tokens: 1_500_000, costUsd: 12.34, unpricedTurns: 0 }],
  agentRuns: [
    { agentId: 'agent-1', agentType: 'Explore', description: 'search the repo', turns: 5, tokens: 200_000, costUsd: 1.5, unpricedTurns: 0 }
  ]
}

function renderSessions(initialEntry: string, response: SessionsResponse | SessionDetailResponse) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })
  )
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Sessions />
    </MemoryRouter>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Sessions', () => {
  it('renders a row per Session with live and ledger-only badges', async () => {
    renderSessions('/sessions', sessionsResponse)
    expect(await screen.findByText('Build the sessions section')).toBeDefined()
    expect(screen.getByText('Untitled session')).toBeDefined()
    expect(screen.getByText('live')).toBeDefined()
    expect(screen.getByText('ledger only')).toBeDefined()
    expect(screen.getByText('admin-center')).toBeDefined()
    expect(screen.getByText('$12.34')).toBeDefined()
    expect(screen.getByText('2 rolled up')).toBeDefined()
  })

  it('opens the advisor panel targeted at the clicked Session', async () => {
    renderSessions('/sessions', sessionsResponse)
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Claude about Build the sessions section' }))
    expect(screen.getByText('ADVISOR // BUILD THE SESSIONS SECTION')).toBeDefined()
    expect(screen.getByText(/session · sess-live/)).toBeDefined()
  })

  it('renders the detail with KPIs, model breakdown, and Agent Runs', async () => {
    renderSessions('/sessions?id=sess-live', detailResponse)
    expect(await screen.findByRole('heading', { name: 'Build the sessions section' })).toBeDefined()
    expect(screen.getByText(/sess-live/)).toBeDefined()
    expect(screen.getByRole('link', { name: 'admin-center' })).toBeDefined()
    expect(screen.getByText('30m')).toBeDefined() // duration KPI
    expect(screen.getByText('claude-sonnet-4-6')).toBeDefined()
    expect(screen.getByText('Explore')).toBeDefined()
    expect(screen.getByText('search the repo')).toBeDefined()
  })
})
