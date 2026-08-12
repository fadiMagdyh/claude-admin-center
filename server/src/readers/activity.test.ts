import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listActivity } from './activity.js'

let configRoot: string

beforeEach(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'activity-config-'))
  writeFileSync(
    join(configRoot, 'history.jsonl'),
    [
      '{"display":"oldest prompt","pastedContents":{},"timestamp":1786550000000,"project":"D:\\\\fixture\\\\alpha","sessionId":"sid-alpha"}',
      'not json at all',
      '{"display":42,"timestamp":1786550500000,"project":"D:\\\\fixture\\\\alpha"}',
      '{"display":"middle prompt","pastedContents":{},"timestamp":1786551000000,"project":"D:\\\\fixture\\\\beta","sessionId":"sid-beta"}',
      '{"display":"newest prompt","timestamp":1786552000000}',
      ''
    ].join('\n')
  )
})

afterEach(() => {
  rmSync(configRoot, { recursive: true, force: true })
})

describe('listActivity', () => {
  it('parses entries newest first, skipping malformed lines and normalizing project paths', () => {
    const { total, entries } = listActivity(configRoot)
    expect(total).toBe(3)
    expect(entries).toEqual([
      { display: 'newest prompt', timestamp: 1786552000000, project: '', projectName: '', sessionId: null },
      {
        display: 'middle prompt',
        timestamp: 1786551000000,
        project: 'D:/fixture/beta',
        projectName: 'beta',
        sessionId: 'sid-beta'
      },
      {
        display: 'oldest prompt',
        timestamp: 1786550000000,
        project: 'D:/fixture/alpha',
        projectName: 'alpha',
        sessionId: 'sid-alpha'
      }
    ])
  })

  it('caps entries at limit while total keeps the full match count', () => {
    const { total, entries } = listActivity(configRoot, { limit: 2 })
    expect(total).toBe(3)
    expect(entries.map((e) => e.display)).toEqual(['newest prompt', 'middle prompt'])
  })

  it('filters to one project by its normalized cwd', () => {
    const { total, entries } = listActivity(configRoot, { project: 'D:/fixture/beta' })
    expect(total).toBe(1)
    expect(entries[0].display).toBe('middle prompt')
  })

  it('degrades to an empty feed when history.jsonl is missing', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'activity-empty-'))
    try {
      expect(listActivity(emptyRoot)).toEqual({ total: 0, entries: [] })
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true })
    }
  })
})
