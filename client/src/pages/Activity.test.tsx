import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityResponse } from 'shared'
import { Activity } from './Activity'

const longPrompt = `refactor the reader ${'x'.repeat(300)}`

const response: ActivityResponse = {
  total: 3,
  entries: [
    {
      display: 'ship the activity section',
      timestamp: Date.now() - 120_000,
      project: 'D:/fixture/alpha',
      projectName: 'alpha',
      sessionId: 'sid-alpha-1234'
    },
    {
      display: longPrompt,
      timestamp: Date.now() - 3_600_000 * 5,
      project: 'D:/fixture/beta',
      projectName: 'beta',
      sessionId: null
    },
    { display: 'prompt with no project', timestamp: Date.now() - 86_400_000 * 3, project: '', projectName: '', sessionId: null }
  ]
}

function renderActivity() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })
  vi.stubGlobal('fetch', fetchMock)
  render(
    <MemoryRouter>
      <Activity />
    </MemoryRouter>
  )
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Activity', () => {
  it('renders the feed with project and session links and truncated long prompts', async () => {
    const fetchMock = renderActivity()
    expect(await screen.findByText('ship the activity section')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/activity?limit=100')

    const projectLink = screen.getByRole('link', { name: 'alpha' })
    expect(projectLink.getAttribute('href')).toBe(`/projects?cwd=${encodeURIComponent('D:/fixture/alpha')}`)

    const sessionLink = screen.getByRole('link', { name: 'sid-alph' })
    expect(sessionLink.getAttribute('href')).toBe('/sessions?id=sid-alpha-1234')

    const truncated = screen.getByText(/^refactor the reader x+…$/)
    expect(truncated.getAttribute('title')).toBe(longPrompt)
  })

  it('filters client-side by project from the dropdown', async () => {
    renderActivity()
    await screen.findByText('ship the activity section')

    fireEvent.change(screen.getByRole('combobox', { name: 'Project' }), { target: { value: 'D:/fixture/beta' } })
    expect(screen.queryByText('ship the activity section')).toBeNull()
    expect(screen.getByText(/^refactor the reader/)).toBeDefined()
  })

  it('refetches with the selected limit', async () => {
    const fetchMock = renderActivity()
    await screen.findByText('ship the activity section')

    fireEvent.click(screen.getByRole('button', { name: '500' }))
    expect(await screen.findByText('ship the activity section')).toBeDefined()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/activity?limit=500')
  })
})
