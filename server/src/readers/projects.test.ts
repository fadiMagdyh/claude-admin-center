import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openLedgerDb, type LedgerDb } from '../ledger/db.js'
import { getProject, listProjects } from './projects.js'

const RECENT_TS = new Date(Date.now() - 86_400_000).toISOString() // inside the 30d window
const OLD_TS = new Date(Date.now() - 60 * 86_400_000).toISOString() // outside it
const COST_RECENT_SONNET = (1000 * 3 + 500 * 15) / 1e6

let configRoot: string
let workdir: string
let workdirKey: string
let db: LedgerDb

function slugOf(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

beforeEach(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'projects-config-'))
  workdir = mkdtempSync(join(tmpdir(), 'projects-work-'))
  workdirKey = workdir.replace(/\\/g, '/') // Registry keys use forward slashes

  writeFileSync(
    join(configRoot, '.claude.json'),
    JSON.stringify({
      projects: {
        [workdirKey]: {
          lastCost: 4.5,
          lastSessionId: 'sess-live',
          lastStartTime: 1_700_000_000_000,
          lastTotalInputTokens: 100,
          lastTotalOutputTokens: 200,
          lastTotalCacheCreationInputTokens: 300,
          lastTotalCacheReadInputTokens: 400,
          mcpServers: { github: { type: 'stdio', command: 'npx' } },
          enabledMcpjsonServers: ['shared-on'],
          disabledMcpjsonServers: ['shared-off'],
          disabledMcpServers: ['claude.ai Notion']
        },
        'D:/missing/ghost': {}
      }
    })
  )
  writeFileSync(
    join(configRoot, 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'alpha@market': true, 'beta@market': true } })
  )

  mkdirSync(join(workdir, '.claude'), { recursive: true })
  writeFileSync(
    join(workdir, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'beta@market': false, 'gamma@market': true } })
  )
  writeFileSync(
    join(workdir, '.claude', 'settings.local.json'),
    JSON.stringify({ enabledPlugins: { 'delta@market': true } })
  )

  const projectDir = join(configRoot, 'projects', slugOf(workdirKey))
  mkdirSync(join(projectDir, 'memory'), { recursive: true })
  writeFileSync(join(projectDir, 'memory', 'MEMORY.md'), '# index')
  writeFileSync(join(projectDir, 'memory', 'topic.md'), 'topic')
  mkdirSync(join(configRoot, 'projects', 'X--orphan-dir'))

  mkdirSync(join(configRoot, 'sessions'))
  writeFileSync(
    join(configRoot, 'sessions', '42.json'),
    JSON.stringify({ pid: 42, sessionId: 'sess-live', cwd: workdir, status: 'busy' })
  )

  db = openLedgerDb(':memory:')
  const insertSession = db.prepare(
    'INSERT INTO sessions (session_id, cwd, title, first_ts, last_ts, transcript_path, transcript_gone) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  // Lowercased backslash cwd — canonical join must still match the Registry key.
  insertSession.run('sess-live', workdir.toLowerCase(), 'Live fixture session', RECENT_TS, RECENT_TS, join(workdir, 'x.jsonl'), 0)
  insertSession.run('sess-gone', workdir, 'GC fixture session', OLD_TS, OLD_TS, null, 1)
  insertSession.run('sess-other', 'D:\\somewhere\\else', 'Other project session', RECENT_TS, RECENT_TS, null, 0)
  db.prepare('INSERT INTO agent_runs (agent_id, session_id, agent_type, description) VALUES (?, ?, ?, ?)').run(
    'agent-1', 'sess-live', 'Explore', 'search the repo'
  )
  const insertTurn = db.prepare(
    'INSERT INTO turns (session_id, uuid, ts, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)'
  )
  insertTurn.run('sess-live', 't-1', RECENT_TS, 'claude-sonnet-4-6', 1000, 500)
  insertTurn.run('sess-live', 't-2', RECENT_TS, 'mystery-model-9', 100, 50)
  insertTurn.run('sess-gone', 't-3', OLD_TS, 'claude-sonnet-4-6', 10, 20)
  insertTurn.run('sess-other', 't-4', RECENT_TS, 'claude-sonnet-4-6', 7, 7)
})

afterEach(() => {
  db.close()
  rmSync(configRoot, { recursive: true, force: true })
  rmSync(workdir, { recursive: true, force: true })
})

describe('listProjects', () => {
  it('joins Registry entries with disk presence and flags Orphaned Projects', () => {
    const res = listProjects(configRoot, db)
    expect(res.registryCount).toBe(2)
    expect(res.orphanCount).toBe(1)
    expect(res.liveCount).toBe(1)
    expect(res.projects).toHaveLength(3)

    const main = res.projects.find((p) => p.path === workdirKey)!
    expect(main.onDisk).toBe(true)
    expect(main.orphaned).toBe(false)
    expect(main.live).toBe(true)
    expect(main.lastCost).toBe(4.5)
    expect(main.lastSessionId).toBe('sess-live')
    expect(main.lastTokens).toBe(1000)
    expect(main.mcpServerCount).toBe(1)
    expect(main.enabledPluginCount).toBe(2) // gamma + delta true; beta overridden off

    const ghost = res.projects.find((p) => p.path === 'D:/missing/ghost')!
    expect(ghost.onDisk).toBe(false)
    expect(ghost.live).toBe(false)
    expect(ghost.ledger30d).toEqual({ sessions: 0, tokens: 0, costUsd: null, unpricedTurns: 0 })

    const orphan = res.projects.find((p) => p.orphaned)!
    expect(orphan.name).toBe('X--orphan-dir')
    expect(orphan.onDisk).toBe(true)
    expect(orphan.ledger30d).toBeNull()
  })

  it('rolls Ledger 30d stats up per project through the canonical cwd join', () => {
    const main = listProjects(configRoot, db).projects.find((p) => p.path === workdirKey)!
    expect(main.ledger30d).not.toBeNull()
    expect(main.ledger30d!.sessions).toBe(1) // sess-gone's only Turn is outside the window
    expect(main.ledger30d!.tokens).toBe(1650)
    expect(main.ledger30d!.costUsd).toBeCloseTo(COST_RECENT_SONNET, 10)
    expect(main.ledger30d!.unpricedTurns).toBe(1)
    expect(main.lastActiveMs).toBe(Date.parse(RECENT_TS))
  })

  it('returns null ledger30d when the Ledger is unavailable', () => {
    const res = listProjects(configRoot, null)
    expect(res.projects.find((p) => p.path === workdirKey)!.ledger30d).toBeNull()
  })
})

describe('getProject', () => {
  it('returns null for a cwd with no Registry entry', () => {
    expect(getProject(configRoot, db, 'D:/never/registered')).toBeNull()
  })

  it('lists the project Sessions with live and transcript-gone badges, newest first', () => {
    const detail = getProject(configRoot, db, workdirKey)!
    expect(detail.sessions.map((s) => s.sessionId)).toEqual(['sess-live', 'sess-gone'])

    const [live, gone] = detail.sessions
    expect(live.title).toBe('Live fixture session')
    expect(live.live).toBe(true)
    expect(live.transcriptGone).toBe(false)
    expect(live.agentRuns).toBe(1)
    expect(live.turns).toBe(2)
    expect(live.tokens).toBe(1650)
    expect(live.costUsd).toBeCloseTo(COST_RECENT_SONNET, 10)
    expect(live.unpricedTurns).toBe(1)

    expect(gone.live).toBe(false)
    expect(gone.transcriptGone).toBe(true)
    expect(gone.tokens).toBe(30) // all-time, even outside the 30d window
  })

  it('resolves Effective Enablement across global, project, and Registry MCP scopes', () => {
    const enablement = getProject(configRoot, db, workdirKey)!.enablement
    const byName = new Map(enablement.map((e) => [e.name, e]))

    expect(byName.get('alpha')).toEqual({ name: 'alpha', kind: 'plugin', on: true, scope: 'global' })
    expect(byName.get('beta')).toEqual({ name: 'beta', kind: 'plugin', on: false, scope: 'overridden here' })
    expect(byName.get('gamma')).toEqual({ name: 'gamma', kind: 'plugin', on: true, scope: 'this project' })
    expect(byName.get('delta')).toEqual({ name: 'delta', kind: 'plugin', on: true, scope: 'this project' })
    expect(byName.get('github')).toEqual({ name: 'github', kind: 'mcp', on: true, scope: 'this project' })
    expect(byName.get('shared-on')).toEqual({ name: 'shared-on', kind: 'mcp', on: true, scope: 'this project' })
    expect(byName.get('shared-off')).toEqual({ name: 'shared-off', kind: 'mcp', on: false, scope: 'this project' })
    expect(byName.get('claude.ai Notion')).toEqual({ name: 'claude.ai Notion', kind: 'mcp', on: false, scope: 'overridden here' })
    expect(enablement).toHaveLength(8)
  })

  it('points at the memory directory', () => {
    const memory = getProject(configRoot, db, workdirKey)!.memory
    expect(memory).not.toBeNull()
    expect(memory!.hasMemoryMd).toBe(true)
    expect(memory!.fileCount).toBe(2)
    expect(memory!.lastModifiedMs).toBeGreaterThan(0)

    expect(getProject(configRoot, db, 'D:/missing/ghost')!.memory).toBeNull()
  })
})
