# Wayfinder map: Claude Admin Center v1

Label: `wayfinder:map`

## Destination

A working, read-only v1 of **Claude Admin Center** running locally: a Vite + React + TypeScript web UI backed by a small Node API server that reads `D:\claude-config`, with eight sections — Projects, Sessions, Usage, Models, Skills, Plugins, MCP servers, Activity feed — where every object carries an "Ask Claude" icon that spawns a headless Claude session and renders persisted recommendations inline. Usage history survives transcript garbage-collection via a local SQLite ledger.

## Notes

- **Execution override:** this map carries execution, not just planning — the destination is a *working v1*, so build tickets are in scope once their design tickets resolve.
- **Charter decisions (locked during charting, 2026-08-11):** local-machine data only (no claude.ai/Console org data); local web app; advisor = headless `claude -p`/Agent SDK spawn with results rendered inline; read-only + advice (no mutations); single-user (Fadi), but keep paths configurable — `CLAUDE_CONFIG_DIR` resolution, no hard-coding; stack = Vite + React + TS client, Node (Hono) API server, SQLite (better-sqlite3); advisor recommendations are persisted with run history.
- **Standing preferences (from [claude.md](../../claude.md)):** don't assume — ask; prefer existing libraries over from-scratch; code readable without docs; don't touch working parts unless asked; no over-engineering; record mistakes in claude.md's Lessons Learned.
- **Skills to consult:** `/grilling` + `/domain-modeling` on every grilling ticket; `/prototype` for UI tickets; `dataviz` before any chart; `codebase-design` when shaping the server's reader/ledger modules; `claude-api` for anything touching model ids or pricing.
- **Data landscape:** the full inventory of where every domain's data lives is at [docs/research/claude-data-inventory.md](../../docs/research/claude-data-inventory.md). Read it before any design ticket — it names the load-bearing gaps (no usage ledger, no cost in transcripts, destructive `last*` fields, GC'd transcripts, lossy project slugs).
- **Tracker:** local-markdown. Tickets live in [issues/](./issues/); `Status:` line = open/claimed/resolved; `Blocked by:` lists ticket numbers; frontier = open + unblocked + unclaimed, lowest number first.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Research: spawning headless Claude sessions from Node on Windows](./issues/01-research-headless-claude.md) — advisor runs use `claude -p` + `--json-schema` for structured output, `--allowedTools`/`dontAsk` for read-only safety, and `--no-session-persistence` to avoid transcript pollution; findings in [docs/research/headless-claude-invocation.md](../../docs/research/headless-claude-invocation.md).
- [Research: model pricing table for the usage ledger](./issues/02-research-model-pricing.md) — all observed model ids priced; `[1m]` suffix is price-neutral; cache buckets priced separately (5m 1.25×, 1h 2×, read 0.1×); editable dated `prices.json` shape ready in [docs/research/model-pricing.md](../../docs/research/model-pricing.md).

## Not yet specified

- **Build: section pages** — one build slice per dashboard section (Projects, Sessions, Usage, Models, Skills, Plugins, MCPs, Activity). Can't slice until the domain model (03) and UI prototype (04) settle what each page shows.
- **Build: usage ingester** — implementation of the SQLite ledger + incremental transcript ingestion. Awaits ledger design (06).
- **Build: advisor** — implementation of the spawn-Claude-and-persist-recommendations pipeline. Awaits advisor design (07).
- **v1 ship checklist** — what "working v1" verification looks like (run it end-to-end, seed the ledger, one advisor round-trip per object type). Sharpens once build slices exist.

## Out of scope

- **claude.ai / Anthropic Console org usage** — charter Q2: local-first; cloud data is a separate future effort.
- **Management actions** (enable/disable plugins/MCPs, delete sessions, edit settings) — charter Q5: v1 is read-only + advice.
- **Team packaging / multi-user** — charter Q6: single machine; only keep paths configurable.
- **Extra sections** — settings/permissions/hooks viewer, memory browser, background-jobs/daemon panel — charter Q7: ruled out of v1.
- **OTEL-collector usage pipeline** — a cleaner future ledger source, but v1's ledger is transcript-based.
