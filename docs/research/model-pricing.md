# Model pricing for the usage ledger — research findings (2026-08-11)

Resolves ticket [02-research-model-pricing](../../.scratch/admin-center-v1/issues/02-research-model-pricing.md). Sources: https://platform.claude.com/docs/en/about-claude/pricing.md (fetched 2026-08-11) corroborated by the bundled `claude-api` skill reference. All seven observed model ids resolved — nothing unpriced.

## 1. Price table (USD per MTok, first-party Claude API rates)

| Transcript model id | Input | Output | Cache write 5m (1.25×) | Cache write 1h (2×) | Cache read (0.1×) |
|---|---|---|---|---|---|
| `claude-fable-5` / `claude-fable-5[1m]` | 10.00 | 50.00 | 12.50 | 20.00 | 1.00 |
| `claude-opus-4-7` / `claude-opus-4-7[1m]` | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 |
| `claude-opus-4-8` | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 |
| `claude-sonnet-4-6` | 3.00 | 15.00 | 3.75 | 6.00 | 0.30 |
| `claude-haiku-4-5` (= `claude-haiku-4-5-20251001`) | 1.00 | 5.00 | 1.25 | 2.00 | 0.10 |

**No long-context premium exists for any of these:** Claude 4.6+ models include the 1M window at standard pricing (official doc, verbatim policy). The `[1m]` suffix is price-neutral for every id in our data. Caveat: if a `[1m]` suffix ever appears on a pre-4.6 model, treat it as **unpriced** — those generations had a >200K premium.

Modifiers that exist but don't apply to base ledger math: Batch API (50% off), `inference_geo: "us"` (1.1×), fast mode on Opus 5/4.8 ($10/$50).

## 2. Cache field semantics (matches transcript `usage` shape)

- `cache_creation.ephemeral_5m_input_tokens` → 1.25× base input.
- `cache_creation.ephemeral_1h_input_tokens` → 2× base input.
- `cache_read_input_tokens` → 0.1× base input (same rate whichever TTL wrote it).
- Top-level `cache_creation_input_tokens` = **sum** of the two buckets — never add it on top. If the per-TTL breakdown is absent (old records), price the aggregate at 1.25× and flag approximate.
- `input_tokens` is the *uncached remainder* only.

## 3. Server-tool costs

- `server_tool_use.web_search_requests`: **$0.01 per request** ($10/1,000); result tokens already counted in token fields.
- `server_tool_use.web_fetch_requests`: **$0.00** — content tokens only, no per-request fee.

## 4. Normalization: transcript id → table key

Lookup order, first hit wins: exact raw id → strip `[1m]` suffix → strip trailing `-\d{8}` date → both stripped. No match → **unpriced**: show token counts with an `unpriced` badge, exclude from dollar totals (render totals as "≥ $X + N unpriced"). Never guess or nearest-tier.

## 5. Editable price table shape (`server/prices.json`)

```json
{
  "schema_version": 1,
  "currency": "USD",
  "unit": "per_mtok",
  "sources": ["https://platform.claude.com/docs/en/about-claude/pricing.md (2026-08-11)"],
  "server_tools": {
    "web_search_request": { "usd_per_request": 0.01 },
    "web_fetch_request": { "usd_per_request": 0.0 }
  },
  "models": {
    "claude-fable-5": {
      "match": ["claude-fable-5", "claude-fable-5\\[1m\\]"],
      "prices": [{ "effective_from": "2026-01-01", "input": 10.0, "output": 50.0,
                   "cache_write_5m": 12.5, "cache_write_1h": 20.0, "cache_read": 1.0,
                   "long_context": null }]
    },
    "claude-opus-4-7": {
      "match": ["claude-opus-4-7", "claude-opus-4-7\\[1m\\]"],
      "prices": [{ "effective_from": "2026-01-01", "input": 5.0, "output": 25.0,
                   "cache_write_5m": 6.25, "cache_write_1h": 10.0, "cache_read": 0.5,
                   "long_context": null }]
    },
    "claude-opus-4-8": {
      "match": ["claude-opus-4-8"],
      "prices": [{ "effective_from": "2026-01-01", "input": 5.0, "output": 25.0,
                   "cache_write_5m": 6.25, "cache_write_1h": 10.0, "cache_read": 0.5,
                   "long_context": null }]
    },
    "claude-sonnet-4-6": {
      "match": ["claude-sonnet-4-6"],
      "prices": [{ "effective_from": "2025-01-01", "input": 3.0, "output": 15.0,
                   "cache_write_5m": 3.75, "cache_write_1h": 6.0, "cache_read": 0.3,
                   "long_context": null }]
    },
    "claude-haiku-4-5": {
      "match": ["claude-haiku-4-5", "claude-haiku-4-5-\\d{8}"],
      "prices": [{ "effective_from": "2025-10-01", "input": 1.0, "output": 5.0,
                   "cache_write_5m": 1.25, "cache_write_1h": 2.0, "cache_read": 0.1,
                   "long_context": null }]
    }
  },
  "fallback": { "policy": "unpriced" }
}
```

Design notes: `prices` is a dated array — pick latest `effective_from` ≤ record timestamp (handles price changes/introductory pricing). Cache prices stored absolute, not derived, so hand-edits can't desync. `match` regexes encode normalization in editable data. `long_context` stays `null` until a premium tier ever exists (`{threshold_input_tokens, input, output, …}`).

## Addendum (2026-08-12, ticket #20)

Two models observed in real transcripts were missing from the table above; verified against the same pricing doc (fetched 2026-08-12) and added to `server/prices.json`:

| Transcript model id | Input | Output | Cache write 5m | Cache write 1h | Cache read |
|---|---|---|---|---|---|
| `claude-opus-5` / `claude-opus-5[1m]` | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 |
| `claude-sonnet-5` / `claude-sonnet-5[1m]` | 2.00 | 10.00 | 2.50 | 4.00 | 0.20 |

Note: Sonnet 5's $2/$10 launched as introductory pricing through 2026-08-31, but the pricing doc now states it **is the permanent price** — the scheduled increase to $3/$15 will not occur, so a single dated entry suffices. `<synthetic>` ids in transcripts are error-record noise and stay correctly Unpriced.

## 6. Cost formula per usage record (tokens ÷ 1,000,000)

```
cost = input_tokens × P.input
     + output_tokens × P.output
     + ephemeral_5m_input_tokens × P.cache_write_5m
     + ephemeral_1h_input_tokens × P.cache_write_1h
     + cache_read_input_tokens × P.cache_read
     + web_search_requests × 0.01
```
