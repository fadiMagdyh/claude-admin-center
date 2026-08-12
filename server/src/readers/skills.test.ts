import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openLedgerDb, type LedgerDb } from '../ledger/db.js'
import { listSkills } from './skills.js'

const T_OLD = '2026-08-01T10:00:00.000Z'
const T_NEW = '2026-08-02T10:00:00.000Z'

let configRoot: string
let workdir: string
let workdirKey: string
let extrasInstallPath: string
let db: LedgerDb

function writeSkillMd(dir: string, frontmatter?: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), frontmatter ?? '# no frontmatter\n')
}

beforeEach(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'skills-config-'))
  workdir = mkdtempSync(join(tmpdir(), 'skills-work-'))
  extrasInstallPath = mkdtempSync(join(tmpdir(), 'skills-extras-'))
  workdirKey = workdir.replace(/\\/g, '/') // Registry keys use forward slashes

  writeFileSync(
    join(configRoot, '.claude.json'),
    JSON.stringify({
      projects: { [workdirKey]: {}, 'D:/missing/ghost': {} },
      skillUsage: {
        'toolbox:alpha': { usageCount: 3, lastUsedAt: 2000 },
        alpha: { usageCount: 2, lastUsedAt: 5000 }, // bare historical key — folds into the same row
        dataviz: { usageCount: 7, lastUsedAt: 3000 }, // matches nothing on disk → built-in ghost
        'superpowers:brainstorming': { usageCount: 1, lastUsedAt: 1000 } // uninstalled plugin → ghost
      }
    })
  )
  writeFileSync(
    join(configRoot, 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'toolbox@market': true, 'extras@market': false } })
  )

  mkdirSync(join(configRoot, 'plugins'), { recursive: true })
  writeFileSync(
    join(configRoot, 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'toolbox@market': [{ scope: 'user', version: '2.0.0' }],
        'extras@market': [{ scope: 'user', version: '1.0.0', installPath: extrasInstallPath }]
      }
    })
  )
  const toolbox = join(configRoot, 'plugins', 'cache', 'market', 'toolbox')
  writeSkillMd(join(toolbox, '2.0.0', 'skills', 'core', 'alpha'), '---\nname: alpha\ndescription: Alpha skill.\n---\n')
  writeSkillMd(join(toolbox, '2.0.0', 'skills', 'deprecated', 'old-thing'))
  writeSkillMd(join(toolbox, '2.0.0', 'skills', 'in-progress', 'wip-thing'))
  writeSkillMd(join(toolbox, '1.0.0', 'skills', 'core', 'stale')) // cached but not installed
  writeSkillMd(join(extrasInstallPath, 'skills', 'solo'), '---\nname: solo\ndescription: Skill resolved via installPath.\n---\n')

  writeSkillMd(join(workdir, '.claude', 'skills', 'proj-skill'), '---\ndescription: A project skill.\n---\n')
  writeFileSync(
    join(workdir, '.claude', 'settings.local.json'),
    JSON.stringify({ enabledPlugins: { 'toolbox@market': false }, skillOverrides: { dataviz: 'off' } })
  )

  db = openLedgerDb(':memory:')
  const insertTurn = db.prepare(
    'INSERT INTO turns (session_id, uuid, ts, model, input_tokens, output_tokens, attribution_skill) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  insertTurn.run('sess-1', 't-1', T_OLD, 'claude-sonnet-4-6', 10, 5, 'toolbox:alpha')
  insertTurn.run('sess-1', 't-2', T_NEW, 'claude-sonnet-4-6', 10, 5, 'alpha') // bare attribution folds in too
  insertTurn.run('sess-1', 't-3', T_OLD, 'claude-sonnet-4-6', 10, 5, 'artifact-design') // ghost from Ledger only
  insertTurn.run('sess-1', 't-4', T_OLD, 'claude-sonnet-4-6', 10, 5, null)
})

afterEach(() => {
  db.close()
  rmSync(configRoot, { recursive: true, force: true })
  rmSync(workdir, { recursive: true, force: true })
  rmSync(extrasInstallPath, { recursive: true, force: true })
})

describe('listSkills', () => {
  it('walks only installed plugin versions and takes status from the SKILL.md path', () => {
    const { skills } = listSkills(configRoot, db)
    const names = skills.map((s) => s.name)
    expect(names).not.toContain('stale') // cached 1.0.0 is not the installed version

    const alpha = skills.find((s) => s.name === 'alpha')!
    expect(alpha.key).toBe('plugin:toolbox:alpha')
    expect(alpha.source).toBe('plugin')
    expect(alpha.status).toBe('normal')
    expect(alpha.ghost).toBe(false)
    expect(alpha.plugin).toBe('toolbox')
    expect(alpha.description).toBe('Alpha skill.')

    expect(skills.find((s) => s.name === 'old-thing')!.status).toBe('deprecated')
    expect(skills.find((s) => s.name === 'wip-thing')!.status).toBe('in-progress')
    expect(skills.find((s) => s.name === 'solo')!.plugin).toBe('extras') // resolved via installPath
  })

  it('lists project skills from Registry cwds, tolerating projects without a skills dir', () => {
    const projectRows = listSkills(configRoot, db).skills.filter((s) => s.source === 'project')
    expect(projectRows).toHaveLength(1)
    expect(projectRows[0].name).toBe('proj-skill')
    expect(projectRows[0].key).toBe(`project:${workdirKey}:proj-skill`)
    expect(projectRows[0].projectPath).toBe(workdirKey)
    expect(projectRows[0].description).toBe('A project skill.')
    expect(projectRows[0].enabled).toBe(true)
  })

  it('folds prefixed and bare usage keys into one row and joins Ledger attribution', () => {
    const alpha = listSkills(configRoot, db).skills.find((s) => s.name === 'alpha')!
    expect(alpha.usageCount).toBe(5) // toolbox:alpha (3) + bare alpha (2)
    expect(alpha.lastUsedAtMs).toBe(5000)
    expect(alpha.ledgerTurns).toBe(2) // toolbox:alpha + bare alpha attributions
    expect(alpha.ledgerLastTs).toBe(T_NEW)
  })

  it('creates built-in ghost rows for usage keys that match no on-disk skill', () => {
    const { skills } = listSkills(configRoot, db)

    const dataviz = skills.find((s) => s.name === 'dataviz')!
    expect(dataviz.key).toBe('built-in::dataviz')
    expect(dataviz.source).toBe('built-in')
    expect(dataviz.ghost).toBe(true)
    expect(dataviz.usageCount).toBe(7)
    expect(dataviz.enabled).toBeNull()

    const brainstorming = skills.find((s) => s.name === 'brainstorming')!
    expect(brainstorming.key).toBe('built-in:superpowers:brainstorming')
    expect(brainstorming.plugin).toBe('superpowers')

    const fromLedgerOnly = skills.find((s) => s.name === 'artifact-design')!
    expect(fromLedgerOnly.ghost).toBe(true)
    expect(fromLedgerOnly.usageCount).toBeNull()
    expect(fromLedgerOnly.ledgerTurns).toBe(1)
    expect(fromLedgerOnly.ledgerLastTs).toBe(T_OLD)
  })

  it('reports global enablement plus the overridden-in-N-projects indicator', () => {
    const { skills } = listSkills(configRoot, db)

    const alpha = skills.find((s) => s.name === 'alpha')!
    expect(alpha.enabled).toBe(true) // global settings.json
    expect(alpha.overriddenInProjects).toBe(1) // workdir flips toolbox@market off

    const solo = skills.find((s) => s.name === 'solo')!
    expect(solo.enabled).toBe(false) // globally disabled
    expect(solo.overriddenInProjects).toBe(0)

    const dataviz = skills.find((s) => s.name === 'dataviz')!
    expect(dataviz.overriddenInProjects).toBe(1) // workdir's skillOverrides mention it
  })

  it('sorts by newest activity and works without a Ledger', () => {
    const withDb = listSkills(configRoot, db).skills
    expect(withDb[0].name).toBe('alpha') // newest Ledger attribution wins the sort

    const withoutDb = listSkills(configRoot, null).skills
    expect(withoutDb.find((s) => s.name === 'alpha')!.ledgerTurns).toBe(0)
    expect(withoutDb.find((s) => s.name === 'artifact-design')).toBeUndefined() // its only trace was the Ledger
  })
})
