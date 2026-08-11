# Research: model pricing table for the usage ledger

Type: research
Status: resolved

## Question

Transcripts carry tokens but no dollars, so the dashboard computes cost from a model→price table. Build that table's contents and shape. Resolve:

- Current per-MTok prices (input, output, cache write, cache read) for every model id observed in the local data: `claude-fable-5`, `claude-fable-5[1m]`, `claude-opus-4-7`, `claude-opus-4-7[1m]`, `claude-opus-4-8` (if priced), `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` — plus any long-context (`[1m]`) tier pricing differences.
- Cache pricing nuances: 5-minute vs 1-hour ephemeral cache write multipliers (transcripts record both under `cache_creation`).
- Server-tool costs that appear in usage records: web search / web fetch request pricing.
- How to map transcript model ids (which include suffixes like `[1m]` and dated ids) onto price entries — normalization rules.
- Recommended shape for an *editable* local price table (JSON file checked into the repo) with a fallback rule for unknown model ids (flag as unpriced, don't guess).

Primary sources: Anthropic docs/pricing pages via the `claude-api` skill; verify against the web, don't answer from memory. Answer feeds ticket 06 (ledger design).

## Answer

Full findings incl. the ready-to-use `prices.json` shape: [docs/research/model-pricing.md](../../../docs/research/model-pricing.md). Gist: all seven observed model ids priced from the official pricing doc (fable-5 $10/$50, opus-4-7 & 4-8 $5/$25, sonnet-4-6 $3/$15, haiku-4-5 $1/$5 per MTok). **`[1m]` is price-neutral** — 4.6+ models include the 1M window at standard pricing — so normalization strips `[1m]` and `-YYYYMMDD` suffixes (lookup order: exact → stripped; no match → "unpriced", never guess). Cache: 5m write 1.25×, 1h write 2×, read 0.1×; top-level `cache_creation_input_tokens` is the SUM of the two buckets — don't double-count. Web search $0.01/request; web fetch free. Price entries are dated (`effective_from`) to survive price changes.
