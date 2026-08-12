import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import type { ModelRow, ModelsRange, ModelsResponse } from 'shared'
import { tryLedgerDb } from '../ledger/db.js'
import { priceFor } from '../ledger/prices.js'
import { baseModel, modelTotals, totalTokens, type ModelTotals } from '../ledger/queries.js'
import { resolveConfigRoot } from '../readers/configRoot.js'

const RANGE_DAYS: Record<ModelsRange, number | undefined> = { '30': 30, all: undefined }

export const models = new Hono()

models.get('/', (c) => {
  const range = c.req.query('range') ?? 'all'
  if (!(range in RANGE_DAYS)) return c.json({ error: 'range must be 30 or all' }, 400)

  const db = tryLedgerDb()
  const pinnedModel = readPinnedModel(resolveConfigRoot())
  const rows = db ? modelTotals(db, RANGE_DAYS[range as ModelsRange]).map((model) => toModelRow(model, pinnedModel)) : []
  const body: ModelsResponse = {
    range: range as ModelsRange,
    pinnedModel,
    models: rows,
    unpriced: {
      turns: rows.reduce((sum, row) => sum + row.unpricedTurns, 0),
      models: rows.filter((row) => row.unpricedTurns > 0).map((row) => row.model)
    }
  }
  return c.json(body)
})

/**
 * The default-model pin from <configRoot>/settings.json, [1m] collapsed so it
 * matches base Model rows; null when the file or field is absent.
 */
function readPinnedModel(configRoot: string): string | null {
  try {
    const settings = JSON.parse(readFileSync(join(configRoot, 'settings.json'), 'utf8')) as { model?: unknown }
    return typeof settings.model === 'string' ? baseModel(settings.model) : null
  } catch {
    return null
  }
}

function toModelRow(model: ModelTotals, pinnedModel: string | null): ModelRow {
  // "Today's rates" for the price columns — historical costs still price each Turn at its own date.
  const rates = priceFor(model.model, new Date().toISOString())
  return {
    model: model.model,
    longContext: model.longContext,
    pinnedDefault: model.model === pinnedModel,
    firstTs: model.firstTs,
    lastTs: model.lastTs,
    turns: model.turns,
    sessions: model.sessions,
    inputTokens: model.inputTokens,
    outputTokens: model.outputTokens,
    cacheRead: model.cacheRead,
    cacheWrite: model.cacheWrite5m + model.cacheWrite1h,
    tokens: totalTokens(model),
    costUsd: model.costUsd,
    unpricedTurns: model.unpricedTurns,
    price: rates ? { input: rates.input, output: rates.output, cacheRead: rates.cache_read } : null
  }
}
