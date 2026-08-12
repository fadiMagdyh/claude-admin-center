import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { UsageResponse } from 'shared'
import { ledgerDb } from '../ledger/db.js'
import { app } from '../app.js'

const originalLedgerDbPath = process.env.LEDGER_DB_PATH

const HOUR = 3_600_000
const DAY = 86_400_000

function localDay(msAgo: number): string {
  return new Date(Date.now() - msAgo).toLocaleDateString('en-CA')
}

// Costs per the §6 formula against prices.json:
const COST_FABLE_BASE = (100_000 * 10 + 10_000 * 50) / 1e6 // 1.5
const COST_FABLE_1M = (200_000 * 10 + 20_000 * 50) / 1e6 // 3
const COST_SONNET_20D = (2_000_000 * 3 + 200_000 * 15) / 1e6 // 9
const COST_SONNET_40D = (10_000 * 3 + 1_000 * 15) / 1e6 // 0.045

beforeAll(() => {
  process.env.LEDGER_DB_PATH = ':memory:'
  seedLedger()
})
afterAll(() => {
  if (originalLedgerDbPath === undefined) delete process.env.LEDGER_DB_PATH
  else process.env.LEDGER_DB_PATH = originalLedgerDbPath
})

/**
 * Seed the shared in-memory Ledger with Turns at relative timestamps so the
 * fixed range windows always slice the same way: two priced claude-fable-5
 * Turns today (one on the [1m] long-context variant), one unpriced Turn today,
 * one Sonnet Turn 20 days ago and another 40 days ago.
 */
function seedLedger() {
  const insertTurn = ledgerDb().prepare(
    'INSERT INTO turns (session_id, uuid, ts, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const ts = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
  insertTurn.run('recent-session', 't-1', ts(HOUR), 'claude-fable-5', 100_000, 10_000)
  insertTurn.run('recent-session', 't-2', ts(2 * HOUR), 'claude-fable-5[1m]', 200_000, 20_000)
  insertTurn.run('recent-session', 't-3', ts(HOUR), 'mystery-model-9', 50, 5)
  insertTurn.run('older-session', 't-4', ts(20 * DAY), 'claude-sonnet-4-6', 2_000_000, 200_000)
  insertTurn.run('older-session', 't-5', ts(40 * DAY), 'claude-sonnet-4-6', 10_000, 1_000)
}

async function getUsage(query: string): Promise<UsageResponse> {
  const res = await app.request(`/api/usage${query}`)
  expect(res.status).toBe(200)
  return (await res.json()) as UsageResponse
}

describe('GET /api/usage', () => {
  it('collapses [1m] variants into the base Model with a longContext flag', async () => {
    const body = await getUsage('?range=7')

    expect(body.models.map((m) => m.model)).toEqual(['claude-fable-5', 'mystery-model-9'])
    const fable = body.models[0]
    expect(fable.longContext).toBe(true)
    expect(fable.turns).toBe(2)
    expect(fable.inputTokens).toBe(300_000)
    expect(fable.outputTokens).toBe(30_000)
    expect(fable.tokens).toBe(330_000)
    expect(fable.costUsd).toBeCloseTo(COST_FABLE_BASE + COST_FABLE_1M, 10)

    const today = body.days.at(-1)!
    expect(today.perModel.find((m) => m.model === 'claude-fable-5')?.cost).toBeCloseTo(COST_FABLE_BASE + COST_FABLE_1M, 10)
    expect(today.total).toBeCloseTo(COST_FABLE_BASE + COST_FABLE_1M, 10)
  })

  it('surfaces the Unpriced policy: tokens counted, dollars excluded, summary listed', async () => {
    const body = await getUsage('?range=7')

    const mystery = body.models[1]
    expect(mystery.costUsd).toBeNull()
    expect(mystery.unpricedTurns).toBe(1)
    expect(mystery.tokens).toBe(55)
    expect(body.unpriced).toEqual({ turns: 1, models: ['mystery-model-9'] })
    expect(body.tiles.unpricedTurns).toBe(1)
  })

  it('filters by range and zero-fills the day axis', async () => {
    const week = await getUsage('?range=7')
    expect(week.days).toHaveLength(7)
    expect(week.days[0].day).toBe(localDay(6 * DAY))
    expect(week.days[0].perModel).toEqual([]) // zero-filled — no Turns 6 days ago
    expect(week.models.some((m) => m.model === 'claude-sonnet-4-6')).toBe(false)
    expect(week.tiles.costUsd).toBeCloseTo(COST_FABLE_BASE + COST_FABLE_1M, 2)
    expect(week.tiles.sessions).toBe(1)

    const month = await getUsage('?range=30')
    expect(month.days).toHaveLength(30)
    expect(month.models.map((m) => m.model)).toEqual(['claude-sonnet-4-6', 'claude-fable-5', 'mystery-model-9'])
    expect(month.models[0].costUsd).toBeCloseTo(COST_SONNET_20D, 10)
    expect(month.tiles.sessions).toBe(2)

    const all = await getUsage('?range=all')
    expect(all.days[0].day).toBe(localDay(40 * DAY))
    expect(all.days.at(-1)!.day).toBe(localDay(0))
    expect(all.days).toHaveLength(41)
    expect(all.models[0].costUsd).toBeCloseTo(COST_SONNET_20D + COST_SONNET_40D, 10)
  })

  it('reports the full Ledger history span on every range', async () => {
    const body = await getUsage('?range=7')
    expect(body.tiles.historyDays).toBe(40) // oldest Turn 40d ago → newest 1h ago
  })

  it('defaults to 14 days and rejects an unknown range', async () => {
    const body = await getUsage('')
    expect(body.range).toBe('14')
    expect(body.days).toHaveLength(14)

    expect((await app.request('/api/usage?range=90')).status).toBe(400)
  })
})
