import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openLedgerDb, type LedgerDb } from './db.js'
import { sweep } from './ingest.js'
import { priceFor, turnCostUsd } from './prices.js'
import {
  attributionTotals, ledgerStatus, modelTotals, overviewNumbers, sessionStats, statsBySession, usageByDay
} from './queries.js'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'ledger-config-root')
const SESSION_A = 'aaaa1111-1111-1111-1111-111111111111'

// Fixture costs per the §6 formula (see model-pricing.md):
const COST_A1_SONNET = (1000 * 3 + 500 * 15 + 2000 * 3.75 + 3000 * 6 + 4000 * 0.3) / 1e6 + 2 * 0.01 // 0.0572
const COST_A2_HAIKU_UNTIERED = (500 * 1 + 100 * 5 + 1000 * 1.25) / 1e6 // 0.00225 — aggregate priced at the 5m rate
const COST_S1_FABLE = (200 * 10 + 50 * 50) / 1e6 // 0.0045
const COST_B1_SONNET = (10 * 3 + 20 * 15) / 1e6 // 0.00033

function localDay(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA')
}

describe('prices', () => {
  it('matches raw model ids via the prices.json regexes', () => {
    expect(priceFor('claude-fable-5', '2026-08-01T00:00:00Z')?.input).toBe(10)
    expect(priceFor('claude-fable-5[1m]', '2026-08-01T00:00:00Z')?.input).toBe(10)
    expect(priceFor('claude-haiku-4-5-20251001', '2026-08-01T00:00:00Z')?.input).toBe(1)
    expect(priceFor('claude-mystery-9', '2026-08-01T00:00:00Z')).toBeNull()
  })

  it('returns null before a model\'s first effective_from', () => {
    expect(priceFor('claude-fable-5', '2025-12-31T23:59:59Z')).toBeNull()
  })

  it('prices 5m/1h cache buckets and web_search per the formula', () => {
    expect(turnCostUsd({
      ts: '2026-08-01T10:00:05.000Z', model: 'claude-sonnet-4-6',
      input_tokens: 1000, output_tokens: 500, cache_write_5m: 2000, cache_write_1h: 3000, cache_read: 4000,
      web_search_requests: 2, web_fetch_requests: 1
    })).toBeCloseTo(COST_A1_SONNET, 10)
  })
})

describe('queries over the swept fixture', () => {
  let db: LedgerDb

  beforeAll(() => {
    db = openLedgerDb(':memory:')
    sweep(db, fixtureRoot)
  })
  afterAll(() => db.close())

  it('modelTotals: per-model cost, Unpriced models excluded from dollars but counted', () => {
    const totals = modelTotals(db)
    expect(totals.map((t) => t.model)).toEqual(['claude-sonnet-4-6', 'claude-fable-5', 'claude-haiku-4-5-20251001', 'mystery-model-9'])

    const sonnet = totals[0]
    expect(sonnet.turns).toBe(2)
    expect(sonnet.costUsd).toBeCloseTo(COST_A1_SONNET + COST_B1_SONNET, 10)
    expect(sonnet.inputTokens).toBe(1010)

    const mystery = totals[3]
    expect(mystery.costUsd).toBeNull()
    expect(mystery.unpricedTurns).toBe(1)
    expect(mystery.inputTokens).toBe(100) // tokens still shown
  })

  it('usageByDay: buckets by local day with per-model tokens, cost, and unpriced count', () => {
    const days = usageByDay(db, 36500)
    expect(days.map((d) => d.day)).toEqual([localDay('2026-08-01T10:00:05.000Z'), localDay('2026-08-02T09:00:10.000Z')])

    const [day1, day2] = days
    expect(day1.models).toHaveLength(4)
    expect(day1.costUsd).toBeCloseTo(COST_A1_SONNET + COST_A2_HAIKU_UNTIERED + COST_S1_FABLE, 10)
    expect(day1.unpricedTurns).toBe(1)
    expect(day2.costUsd).toBeCloseTo(COST_B1_SONNET, 10)
  })

  it('sessionStats: Agent Run Turns roll up into the parent Session', () => {
    const stats = sessionStats(db, SESSION_A)!
    expect(stats.title).toBe('Fixture session A')
    expect(stats.turns).toBe(4)
    expect(stats.agentRuns).toBe(1)
    expect(stats.costUsd).toBeCloseTo(COST_A1_SONNET + COST_A2_HAIKU_UNTIERED + COST_S1_FABLE, 10)
    expect(stats.unpricedTurns).toBe(1)
    expect(stats.transcriptGone).toBe(false)
    expect(sessionStats(db, 'no-such-session')).toBeNull()
  })

  it('statsBySession: highest cost first', () => {
    const sessions = statsBySession(db)
    expect(sessions.map((s) => s.sessionId)).toEqual([SESSION_A, 'bbbb2222-2222-2222-2222-222222222222'])
  })

  it('attributionTotals: per skill and per plugin', () => {
    const { skills, plugins } = attributionTotals(db)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('mattpocock-skills:tdd')
    expect(skills[0].costUsd).toBeCloseTo(COST_A1_SONNET, 10)
    expect(skills[0].lastTs).toBe('2026-08-01T10:00:05.000Z')
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe('mattpocock-skills')
  })

  it('ledgerStatus: row counts and Turn timestamp range', () => {
    expect(ledgerStatus(db)).toEqual({
      turns: 5,
      sessions: 2,
      oldestTs: '2026-08-01T10:00:05.000Z',
      newestTs: '2026-08-02T09:00:10.000Z'
    })
  })
})

describe('overviewNumbers', () => {
  let configRoot: string
  let db: LedgerDb

  beforeAll(() => {
    // Generated transcript with a recent timestamp so the fixed 14-day window always covers it.
    configRoot = mkdtempSync(join(tmpdir(), 'ledger-overview-'))
    const projectDir = join(configRoot, 'projects', 'D--gen-app')
    mkdirSync(projectDir, { recursive: true })
    const ts = new Date(Date.now() - 3_600_000).toISOString()
    writeFileSync(join(projectDir, 'cccc3333-3333-3333-3333-333333333333.jsonl'), `${JSON.stringify({
      type: 'assistant', uuid: 't-c1', sessionId: 'cccc3333-3333-3333-3333-333333333333', timestamp: ts,
      cwd: 'D:\\gen\\app',
      message: {
        model: 'claude-sonnet-4-6',
        usage: {
          input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 3_000_000,
          cache_creation_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }
        }
      }
    })}\n`)
    db = openLedgerDb(':memory:')
    sweep(db, configRoot)
  })
  afterAll(() => {
    db.close()
    rmSync(configRoot, { recursive: true, force: true })
  })

  it('computes the 14d landing readouts', () => {
    expect(overviewNumbers(db)).toEqual({
      spend14d: 3.9, // 1M input × $3 + 3M cache read × $0.30
      tokens14d: 4_000_000,
      sessions14d: 1,
      cachePct: 75 // cache_read / (input + cache_read + cache writes)
    })
  })
})
