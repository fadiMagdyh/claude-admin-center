# Claude Admin Center

A read-only local dashboard over the Claude Code state in the config root, with an advisor that asks a headless Claude for recommendations about any object it shows.

## Language

### Core

**Config Root**:
The directory all Claude Code state is read from, resolved from `CLAUDE_CONFIG_DIR`.
_Avoid_: home directory, `.claude` folder, hard-coded paths

**Registry**:
The `projects` map inside the config root's `.claude.json` — the authoritative list of Projects, keyed by cwd.
_Avoid_: project list, config file

**Ledger**:
The dashboard's own SQLite store — the only durable record of usage history, surviving transcript garbage collection. Source of truth for anything historical or aggregated.
_Avoid_: cache, database (unqualified)

**Read Rule**:
The strategy split: history and cross-transcript aggregates come from the Ledger; everything else is a live disk read with a short cache.

**Turn**:
One assistant usage record from a transcript — the Ledger's storage grain. Carries raw model id, all token buckets, server-tool counts, and skill/plugin attribution.
_Avoid_: message, request, iteration

**Sweep**:
One incremental ingest pass: detect new or grown transcript files and append their unseen Turns to the Ledger. Idempotent — re-sweeping never duplicates.

**Unpriced**:
A Turn whose model has no match in the price table. Its tokens are shown, but it is excluded from dollar totals, which render as "≥ $X + N unpriced".

### Projects & sessions

**Project**:
An entry in the Registry, enriched with on-disk artifacts (transcripts, memory) joined on cwd — never on directory slug, which is lossy.
_Avoid_: workspace, repo

**Orphaned Project**:
An on-disk project directory with no matching Registry entry. Still shown, flagged.

**Session**:
A conversation identified by its sessionId — a main transcript, or a Ledger record whose transcript was garbage-collected. Agent Runs' usage rolls up into it.
_Avoid_: conversation, chat, transcript (as the entity)

**Agent Run**:
A subagent transcript. Always a child of a Session, shown inside its detail — never a standalone Session.
_Avoid_: subagent session, sidechain

**Live Session**:
A Session currently present in the live-session registry (`sessions/*.json`) with a running status. All other Sessions are historical.

### Catalog domains

**MCP Server**:
Anything Claude can talk to over MCP, whatever its provenance: `local` (stdio definition in a project's config) or `managed` (claude.ai connector known locally only via its auth cache).
_Avoid_: connector, integration

**Skill**:
An invocable skill from any Skill Source, listed once with its source and status badges. All statuses are listed, including deprecated and in-progress.

**Skill Source**:
Where a Skill comes from: `plugin` (bundled in a plugin's cache), `project` (a project's `.claude/skills/`), or `built-in` (shipped in the binary — visible only as a ghost row derived from usage data, no SKILL.md on disk).

**Model**:
A base model id. Long-context variants (`[1m]` suffix) collapse into their base Model for display and grouping; the Ledger keeps the raw id.
_Avoid_: SKU, model string (for the entity)

**Effective Enablement**:
The per-project resolved on/off state of a plugin, skill, or MCP Server after global settings and that project's overrides are applied. Computed lazily on a Project's detail; global views show global state plus an overridden-in-N-projects indicator.

**Activity**:
The feed of submitted prompts from the global `history.jsonl`.
_Avoid_: audit log, events

### Advisor

**Advisor Run**:
One spawn of headless Claude against a single object (or the whole setup), from request to persisted outcome. Leaves no transcript behind.
_Avoid_: analysis, check, ask

**Recommendation**:
One finding produced by an Advisor Run: severity, finding, suggested action. Persisted with its run; rendered inline on the object.
_Avoid_: advice, tip, insight
