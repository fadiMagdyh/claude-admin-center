import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The server package directory (parent of src/ and dist/), where prices.json lives. */
const serverPackageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** One dated price row from prices.json, USD per MTok. */
export type ModelRates = {
  effective_from: string
  input: number
  output: number
  cache_write_5m: number
  cache_write_1h: number
  cache_read: number
}

type PricesFile = {
  server_tools: {
    web_search_request: { usd_per_request: number }
    web_fetch_request: { usd_per_request: number }
  }
  models: Record<string, { match: string[]; prices: ModelRates[] }>
}

type CompiledPrices = {
  models: Array<{ patterns: RegExp[]; prices: ModelRates[] }>
  webSearchUsd: number
  webFetchUsd: number
}

let compiled: CompiledPrices | null = null

/** prices.json loaded and compiled once per process. */
function loadPrices(): CompiledPrices {
  if (compiled) return compiled
  const file = JSON.parse(readFileSync(join(serverPackageDir, 'prices.json'), 'utf8')) as PricesFile
  compiled = {
    models: Object.values(file.models).map((model) => ({
      patterns: model.match.map((source) => new RegExp(`^(?:${source})$`)),
      prices: [...model.prices].sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    })),
    webSearchUsd: file.server_tools.web_search_request.usd_per_request,
    webFetchUsd: file.server_tools.web_fetch_request.usd_per_request
  }
  return compiled
}

/**
 * Rates for a raw transcript model id at a timestamp: first model whose match
 * regexes hit, latest price row with effective_from <= ts. Null → the Turn is
 * Unpriced (tokens shown, excluded from dollar totals).
 */
export function priceFor(rawModelId: string, ts: string): ModelRates | null {
  const day = ts.slice(0, 10)
  for (const model of loadPrices().models) {
    if (!model.patterns.some((pattern) => pattern.test(rawModelId))) continue
    const applicable = model.prices.filter((price) => price.effective_from <= day)
    return applicable.at(-1) ?? null
  }
  return null
}

/** The token fields the cost formula reads — a turns row satisfies this. */
export type TurnTokens = {
  ts: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_write_5m: number
  cache_write_1h: number
  cache_read: number
  web_search_requests: number
  web_fetch_requests: number
}

/**
 * Cost of one Turn per the §6 formula. Rows with cache_untiered=1 already hold
 * their aggregate cache write in cache_write_5m, so the same math applies.
 * Null → Unpriced.
 */
export function turnCostUsd(turn: TurnTokens): number | null {
  const rates = priceFor(turn.model, turn.ts)
  if (!rates) return null
  const { webSearchUsd, webFetchUsd } = loadPrices()
  const tokenCost =
    (turn.input_tokens * rates.input +
      turn.output_tokens * rates.output +
      turn.cache_write_5m * rates.cache_write_5m +
      turn.cache_write_1h * rates.cache_write_1h +
      turn.cache_read * rates.cache_read) /
    1_000_000
  return tokenCost + turn.web_search_requests * webSearchUsd + turn.web_fetch_requests * webFetchUsd
}
