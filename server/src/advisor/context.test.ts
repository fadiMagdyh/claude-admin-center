import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdvisorObjectType } from 'shared'
import { openLedgerDb, type LedgerDb } from '../ledger/db.js'
import { assembleContext, truncateSummary } from './context.js'

let configRoot: string
let projectCwd: string
let db: LedgerDb

beforeAll(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'advisor-config-root-'))
  projectCwd = join(configRoot, 'work', 'alpha')

  // A Registry project with a local MCP definition and one project Skill on disk.
  writeFileSync(
    join(configRoot, '.claude.json'),
    JSON.stringify({
      projects: {
        [projectCwd]: {
          lastCost: 1.25,
          mcpServers: { whiteboard: { type: 'stdio', command: 'npx', args: ['whiteboard-mcp'] } }
        }
      },
      skillUsage: { tdd: { usageCount: 3, lastUsedAt: 1754000000000 } },
      pluginUsage: { 'tools@market': { usageCount: 2, lastUsedAt: 1754000000000 } }
    })
  )
  writeFileSync(join(configRoot, 'settings.json'), JSON.stringify({ enabledPlugins: { 'tools@market': true } }))
  mkdirSync(join(configRoot, 'plugins'), { recursive: true })
  writeFileSync(
    join(configRoot, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ plugins: { 'tools@market': [{ version: '1.0.0', scope: 'user' }] } })
  )
  const skillDir = join(projectCwd, '.claude', 'skills', 'tdd')
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: Test-first loop\n---\nRed, green, refactor.')

  db = openLedgerDb(':memory:')
  db.prepare(
    "INSERT INTO sessions (session_id, cwd, title, transcript_path) VALUES ('sess-1', ?, 'Build the thing', ?)"
  ).run(projectCwd, join(configRoot, 'projects', 'x', 'sess-1.jsonl'))
  db.prepare(
    'INSERT INTO turns (session_id, uuid, ts, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('sess-1', 't-1', new Date().toISOString(), 'claude-fable-5', 1000, 100)
})
afterAll(() => {
  rmSync(configRoot, { recursive: true, force: true })
})

/** Every object type with a fixture-backed key. */
function keys(): Array<[AdvisorObjectType, string]> {
  return [
    ['project', projectCwd],
    ['session', 'sess-1'],
    ['skill', `project:${projectCwd}:tdd`],
    ['plugin', 'tools@market'],
    ['mcp', 'local:whiteboard'],
    ['model', 'claude-fable-5'],
    ['overview', 'overview']
  ]
}

describe('assembleContext', () => {
  it('returns a non-empty JSON summary with a stable hash for every object type', () => {
    for (const [objectType, objectKey] of keys()) {
      const context = assembleContext(configRoot, db, objectType, objectKey)
      expect(context.summary.length, objectType).toBeGreaterThan(20)
      expect(JSON.parse(context.summary), objectType).toMatchObject({ objectType, objectKey })
      expect(context.contextHash, objectType).toMatch(/^[0-9a-f]{64}$/)
      expect(Array.isArray(context.filePaths), objectType).toBe(true)
      // Same input → same hash: the "input unchanged" badge depends on this.
      expect(assembleContext(configRoot, db, objectType, objectKey).contextHash, objectType).toBe(context.contextHash)
    }
  })

  it('changes the hash when the underlying data changes', () => {
    const before = assembleContext(configRoot, db, 'model', 'claude-fable-5').contextHash
    db.prepare(
      'INSERT INTO turns (session_id, uuid, ts, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sess-1', 't-2', new Date().toISOString(), 'claude-fable-5', 500, 50)
    expect(assembleContext(configRoot, db, 'model', 'claude-fable-5').contextHash).not.toBe(before)
  })

  it('inlines the project Skill SKILL.md and points at its path', () => {
    const context = assembleContext(configRoot, db, 'skill', `project:${projectCwd}:tdd`)
    expect(context.summary).toContain('Red, green, refactor.')
    expect(context.filePaths.some((p) => p.endsWith('SKILL.md'))).toBe(true)
  })

  it('keeps the session transcript path out of filePaths when the transcript is gone', () => {
    const context = assembleContext(configRoot, db, 'session', 'sess-1')
    expect(context.filePaths).toEqual([]) // fixture path does not exist on disk
    expect(JSON.parse(context.summary).session.sessionId).toBe('sess-1')
  })

  it('still assembles for an unknown key, flagging it', () => {
    const context = assembleContext(configRoot, db, 'plugin', 'ghost@nowhere')
    expect(context.summary).toContain('notFound')
  })
})

describe('truncateSummary', () => {
  it('caps at ~50KB with a truncation marker and leaves short input alone', () => {
    expect(truncateSummary('short')).toBe('short')
    const long = truncateSummary('x'.repeat(60_000))
    expect(long.length).toBeLessThan(51_000)
    expect(long).toContain('TRUNCATED')
  })
})
