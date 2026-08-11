# Usage ledger and ingester design

Type: grilling
Status: open
Blocked by: 02, 03

## Question

Design the SQLite ledger that gives Usage/Models/Skills/Plugins their history (transcripts are the only complete token record, and they get garbage-collected). Decide with the user:

- Schema: sessions, turns (model, tokens incl. cache tiers, timestamps, skill/plugin attribution), derived daily rollups — what grain do we store vs compute?
- Incremental ingest: dedup key (`sessionId` + record `uuid`), detecting new/changed transcript files cheaply, handling subagent transcripts and the `iterations[]` per-round-trip breakdown.
- Trigger: filesystem watcher vs on-page-load sweep vs interval — pick the simplest that feels live.
- Seeding history: what's recoverable from `.claude.json` `last*` fields, its rolling `backups/`, and the stale `stats-cache.json` — worth ingesting or not?
- Cost computation: apply the price table from ticket 02 at ingest time or query time; how unpriced models surface in the UI.
- GC resilience: ledger is append-only source of truth once a transcript disappears — confirm retention/versioning story.
