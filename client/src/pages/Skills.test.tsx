import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillsResponse } from 'shared'
import { Skills } from './Skills'

const response: SkillsResponse = {
  skills: [
    {
      key: 'plugin:mattpocock-skills:tdd', name: 'tdd', source: 'plugin', status: 'normal', ghost: false,
      plugin: 'mattpocock-skills', projectPath: null, description: 'Test-driven development.',
      usageCount: 12, lastUsedAtMs: Date.now() - 3_600_000, ledgerTurns: 46, ledgerLastTs: '2026-08-01T10:00:00.000Z',
      enabled: true, overriddenInProjects: 2
    },
    {
      key: 'plugin:mattpocock-skills:qa', name: 'qa', source: 'plugin', status: 'deprecated', ghost: false,
      plugin: 'mattpocock-skills', projectPath: null, description: null,
      usageCount: null, lastUsedAtMs: null, ledgerTurns: 0, ledgerLastTs: null,
      enabled: false, overriddenInProjects: 0
    },
    {
      key: 'project:D:/work/app:pptx-helper', name: 'pptx-helper', source: 'project', status: 'normal', ghost: false,
      plugin: null, projectPath: 'D:/work/app', description: null,
      usageCount: 3, lastUsedAtMs: Date.now() - 86_400_000 * 3, ledgerTurns: 0, ledgerLastTs: null,
      enabled: true, overriddenInProjects: 0
    },
    {
      key: 'built-in::dataviz', name: 'dataviz', source: 'built-in', status: 'normal', ghost: true,
      plugin: null, projectPath: null, description: null,
      usageCount: 7, lastUsedAtMs: Date.now() - 7_200_000, ledgerTurns: 313, ledgerLastTs: '2026-08-11T11:00:00.000Z',
      enabled: null, overriddenInProjects: 1
    }
  ]
}

function renderSkills() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })
  vi.stubGlobal('fetch', fetchMock)
  render(<Skills />)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Skills', () => {
  it('renders the unified list with source, status and ghost rows', async () => {
    const fetchMock = renderSkills()
    expect(await screen.findByText('tdd')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/skills')

    expect(screen.getAllByText('plugin')).toHaveLength(2)
    expect(screen.getByText('project')).toBeDefined()
    expect(screen.getByText('built-in')).toBeDefined()
    expect(screen.getByText('deprecated')).toBeDefined()
    expect(screen.getByText('dataviz').closest('tr')?.className).toBe('ghost')
    expect(screen.getByText('overridden in 2 projects')).toBeDefined()
    expect(screen.getByText('313')).toBeDefined() // dataviz Ledger turns
  })

  it('filters by Skill Source with the pills', async () => {
    renderSkills()
    await screen.findByText('tdd')

    fireEvent.click(screen.getByRole('button', { name: 'Built-in (1)' }))
    expect(screen.queryByText('tdd')).toBeNull()
    expect(screen.getByText('dataviz')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Project (1)' }))
    expect(screen.getByText('pptx-helper')).toBeDefined()
    expect(screen.queryByText('dataviz')).toBeNull()
  })

  it('opens the AdvisorPanel targeted at the skill key', async () => {
    renderSkills()
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Claude about tdd' }))
    expect(screen.getByText('ADVISOR // TDD')).toBeDefined()
    expect(screen.getByText('TARGET · skill · plugin:mattpocock-skills:tdd')).toBeDefined()
  })
})
