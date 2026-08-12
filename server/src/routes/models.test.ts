import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModelsResponse } from 'shared'
import { ledgerDb } from '../ledger/db.js'
import { app } from '../app.js'

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalLedgerDbPath = process.env.LEDGER_DB_PATH

const HOUR = 3_600_000
const DAY = 86_400_000

// Costs per the §6 formula against prices.json:
const COST_FABLE_BASE = (100_000 * 10 + 10_000 * 50) / 1e6 // 1.5
const COST_FABLE_1M = (200_000 * 10 + 20_000 * 50) / 1e6 // 3
const COST_FABLE_OLD = (10_000 * 10 + 1_000 * 50) / 1e6 // 0.15

let configRoot: string

beforeAll(() => {
  // The pin carries the [1m] suffix on purpose: it must match the collapsed base Model row.
  configRoot = mkdtempSync(join(tmpdir(), 'models-config-root-'))
  writeFileSync(join(configRoot, 'settings.json'), JSON.stringify({ model: 'claude-fable-5[1m]' }))
  process.env.CLAUDE_CONFIG_DIR = configRoot
  process.env.LEDGER_DB_PATH = ':memory:'
  seedLedger()
})
afterAll(() => {
  process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  if (originalLedgerDbPath === undefined) delete process.env.LEDGER_DB_PATH
  else process.env.LEDGER_DB_PATH = originalLedgerDbPath
  rmSync(configRoot, { recursive: true, force: true })
})

/**
 * Seed the shared in-memory Ledger with Turns at relative timestamps: two
 * priced claude-fable-5 Turns today in session-a (one on the [1m] variant),
 * one 40 days ago in session-b, and one unpriced Turn today in session-a.
 */
function seedLedger() {
  const insertTurn = ledgerDb().prepare(
    'INSERT INTO turns (session_id, uuid, ts, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const ts = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
  insertTurn.run('session-a', 't-1', ts(HOUR), 'claude-fable-5', 100_000, 10_000)
  insertTurn.run('session-a', 't-2', ts(2 * HOUR), 'claude-fable-5[1m]', 200_000, 20_000)
  insertTurn.run('session-a', 't-3', ts(HOUR), 'mystery-model-9', 50, 5)
  insertTurn.run('session-b', 't-4', ts(40 * DAY), 'claude-fable-5', 10_000, 1_000)
}

async function getModels(query: string): Promise<ModelsResponse> {
  const res = await app.request(`/api/models${query}`)
  expect(res.status).toBe(200)
  return (await res.json()) as ModelsResponse
}

describe('GET /api/models', () => {
  it('collapses [1m] into the base Model with span, sessions touched and cost', async () => {
    const body = await getModels('?range=all')

    expect(body.models.map((m) => m.model)).toEqual(['claude-fable-5', 'mystery-model-9'])
    const fable = body.models[0]
    expect(fable.longContext).toBe(true)
    expect(fable.turns).toBe(3)
    expect(fable.sessions).toBe(2)
    expect(fable.inputTokens).toBe(310_000)
    expect(fable.outputTokens).toBe(31_000)
    expect(fable.tokens).toBe(341_000)
    expect(fable.costUsd).toBeCloseTo(COST_FABLE_BASE + COST_FABLE_1M + COST_FABLE_OLD, 10)
    expect(Date.now() - Date.parse(fable.firstTs)).toBeGreaterThan(39 * DAY) // oldest Turn: 40d ago
    expect(Date.now() - Date.parse(fable.lastTs)).toBeLessThan(2 * HOUR) // newest Turn: 1h ago
  })

  it('flags the settings.json pin on the base Model row after [1m] collapse', async () => {
    const body = await getModels('')
    expect(body.pinnedModel).toBe('claude-fable-5')
    expect(body.models.find((m) => m.model === 'claude-fable-5')?.pinnedDefault).toBe(true)
    expect(body.models.find((m) => m.model === 'mystery-model-9')?.pinnedDefault).toBe(false)
  })

  it('joins the current price-table entry and applies the Unpriced policy', async () => {
    const body = await getModels('?range=all')

    const fable = body.models[0]
    expect(fable.price).toEqual({ input: 10, output: 50, cacheRead: 1 })

    const mystery = body.models[1]
    expect(mystery.price).toBeNull()
    expect(mystery.costUsd).toBeNull()
    expect(mystery.unpricedTurns).toBe(1)
    expect(mystery.tokens).toBe(55)
    expect(body.unpriced).toEqual({ turns: 1, models: ['mystery-model-9'] })
  })

  it('scopes aggregates to the 30-day range', async () => {
    const body = await getModels('?range=30')
    const fable = body.models.find((m) => m.model === 'claude-fable-5')!
    expect(fable.turns).toBe(2) // the 40d-old Turn falls outside
    expect(fable.sessions).toBe(1)
    expect(fable.costUsd).toBeCloseTo(COST_FABLE_BASE + COST_FABLE_1M, 10)
  })

  it('defaults to all time and rejects an unknown range', async () => {
    const body = await getModels('')
    expect(body.range).toBe('all')
    expect(body.models[0].turns).toBe(3)

    expect((await app.request('/api/models?range=7')).status).toBe(400)
  })
})
