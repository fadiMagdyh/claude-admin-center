import { Hono } from 'hono'
import type { UsageDay, UsageModelRow, UsageRange, UsageResponse, UsageTiles } from 'shared'
import { tryLedgerDb, type LedgerDb } from '../ledger/db.js'
import {
  ledgerStatus, localDay, modelTotals, rangeNumbers, totalTokens, usageByDay,
  type DayUsage, type ModelTotals
} from '../ledger/queries.js'

/** The range presets the pills offer; `undefined` days = all recorded time. */
const RANGE_DAYS: Record<UsageRange, number | undefined> = { '7': 7, '14': 14, '30': 30, all: undefined }

export const usage = new Hono()

usage.get('/', (c) => {
  const range = c.req.query('range') ?? '14'
  if (!(range in RANGE_DAYS)) return c.json({ error: 'range must be 7, 14, 30 or all' }, 400)
  const days = RANGE_DAYS[range as UsageRange]

  const db = tryLedgerDb()
  const models = db ? modelTotals(db, days).map(toModelRow) : []
  const body: UsageResponse = {
    range: range as UsageRange,
    tiles: tiles(db, days),
    days: db ? zeroFilledDays(usageByDay(db, days), days) : [],
    models,
    unpriced: {
      turns: models.reduce((sum, model) => sum + model.unpricedTurns, 0),
      models: models.filter((model) => model.unpricedTurns > 0).map((model) => model.model)
    }
  }
  return c.json(body)
})

const EMPTY_TILES: UsageTiles = { costUsd: null, unpricedTurns: 0, tokens: 0, sessions: 0, cachePct: 0, historyDays: 0 }

function tiles(db: LedgerDb | null, days?: number): UsageTiles {
  if (!db) return EMPTY_TILES
  const status = ledgerStatus(db)
  const historyDays = status.oldestTs && status.newestTs
    ? Math.floor((Date.parse(status.newestTs) - Date.parse(status.oldestTs)) / 86_400_000) + 1
    : 0
  return { ...rangeNumbers(db, days), historyDays }
}

function toModelRow(model: ModelTotals): UsageModelRow {
  return {
    model: model.model,
    longContext: model.longContext,
    turns: model.turns,
    inputTokens: model.inputTokens,
    outputTokens: model.outputTokens,
    cacheRead: model.cacheRead,
    cacheWrite: model.cacheWrite5m + model.cacheWrite1h,
    tokens: totalTokens(model),
    costUsd: model.costUsd,
    unpricedTurns: model.unpricedTurns
  }
}

/**
 * A continuous local-day axis for the chart: every day from the range start
 * (or the oldest recorded day for "all") through today, zero-filled where no
 * Turns landed. Capped at 10 years in case a transcript carries a bogus timestamp.
 */
function zeroFilledDays(recorded: DayUsage[], days?: number): UsageDay[] {
  const byDay = new Map(recorded.map((day) => [day.day, day]))
  const firstDay = days !== undefined
    ? localDay(new Date(Date.now() - (days - 1) * 86_400_000).toISOString())
    : recorded[0]?.day
  if (!firstDay) return []

  const result: UsageDay[] = []
  for (let back = 0; back < 3650; back++) {
    const day = localDay(new Date(Date.now() - back * 86_400_000).toISOString())
    if (day < firstDay) break
    if (result.at(-1)?.day === day) continue // 24h steps can repeat a wall-clock day across DST
    result.push(toUsageDay(day, byDay.get(day)))
  }
  return result.reverse()
}

function toUsageDay(day: string, recorded: DayUsage | undefined): UsageDay {
  if (!recorded) return { day, perModel: [], total: 0 }
  return {
    day,
    perModel: recorded.models.map((model) => ({
      model: model.model,
      cost: model.costUsd ?? 0,
      unpricedTurns: model.unpricedTurns
    })),
    total: recorded.costUsd
  }
}
