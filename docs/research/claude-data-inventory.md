# Claude Code data landscape — inventory (2026-08-11)

Where every dashboard domain's data lives on this machine, its format, and the gaps to engineer around. Gathered by exploration of the live config; verify shapes against current files before coding readers.

## Config root

`CLAUDE_CONFIG_DIR=D:\claude-config` is set — **all Claude Code state lives there**, not in the user home. `C:\Users\Fadi.Magdy\.claude\` is a vestigial stub (statusline scripts only); `C:\Users\Fadi.Magdy\.claude.json` does not exist. The global config JSON is `D:\claude-config\.claude.json` (~131 KB). Claude Code 2.1.227, native install.

## 1. Projects

- **Registry (authoritative):** `.claude.json` → `projects` map, **48 entries**, keyed by forward-slash cwd (e.g. `D:/Interviews`).
- **On disk:** `D:\claude-config\projects\<mangled-cwd>\` — **22 dirs** (only projects with surviving transcripts/memory). Dir names replace `:`/`\` with `-` — **lossy**: `D--Claude-claude-code-workshop` vs `D--claude-code-workshop` are distinct projects that read ambiguously; join on `cwd` from transcript records or the registry key, never on the slug.
- **Per-project record:** `allowedTools[]`, `mcpServers{}`, `enabledMcpjsonServers[]`/`disabledMcpjsonServers[]`/`disabledMcpServers[]`, trust flags, plus **last-session metrics** (43/48 projects): `lastCost` (USD), `lastTotalInputTokens`/`OutputTokens`/`CacheCreation`/`CacheRead`, `lastAPIDuration`, `lastLinesAdded/Removed`, `lastSessionId`, `lastStartTime`, and `lastModelUsage` (dict keyed by full model id → tokens + `costUSD`), and `lastSessionMetrics` (frame/hook perf percentiles).
- **Caveat:** all `last*` fields are **last-session-only, overwritten every run**. No historical per-project series here.

## 2. Sessions / transcripts

- **Main transcripts:** `projects\<project>\<session-uuid>.jsonl`; **subagents:** sibling `<session-uuid>\subagents\agent-<id>.jsonl` + `agent-<id>.meta.json` (`{agentType, description, toolUseId, spawnDepth}`).
- **Scale:** 132 jsonl files (67 main + 65 subagent), ~201 MB, largest ~14 MB, on-disk range 2026-07-09 → today. A `.last-cleanup` marker + projects left with only `memory/` dirs ⇒ **transcripts are garbage-collected**.
- **Format:** NDJSON, heterogeneous `type`: `user`, `assistant`, `attachment`, `system` (incl. `turn_duration`), `mode`/`permission-mode`, `ai-title` (session display name), `last-prompt`, `file-history-snapshot`/`-delta`, `queue-operation`.
- **Every conversational record:** `uuid`, `parentUuid` (a DAG, not a list), `sessionId`, `timestamp` (ISO UTC), `cwd`, `version`, `gitBranch`, `isSidechain`, `slug`.
- **Assistant records (usage goldmine):** `message.model`; `message.usage` with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_creation.{ephemeral_1h_input_tokens, ephemeral_5m_input_tokens}`, `server_tool_use.{web_search_requests, web_fetch_requests}`, `service_tier`, and per-round-trip `iterations[]`; plus `requestId`, `effort`, `stop_reason`, and **`attributionPlugin`/`attributionSkill`** (which plugin/skill drove the turn — enables skill/plugin ROI views). **No cost field anywhere in transcripts** — dollars must be computed from a price table.
- **Tool calls:** `assistant.message.content[].type == "tool_use"` (`.name`); results in the next user record's `toolUseResult`.
- **Sidecars keyed by session:** `sessions\<pid>.json` (**live/recent session registry**: pid, sessionId, cwd, name, status, timestamps — best "running now" source); `session-env\<uuid>\`; `file-history\<uuid>\`; `tasks\<uuid>\`; `shell-snapshots\`.

## 3. Usage / tokens / cost — the weak domain

No central ledger. Four partial sources:

1. **Transcripts** — the only complete, historical, per-turn token record (~201 MB to scan; no dollars).
2. **`stats-cache.json`** — right shape (`dailyActivity[]`, `dailyModelTokens[]`, `modelUsage`) but **stale since 2026-05-31**, holds a single day, `costUSD: 0`. Effectively abandoned.
3. **`.claude.json` `last*` + `lastModelUsage`** — real `costUSD`, last-session-only.
4. **`.claude.json` `skillUsage`/`pluginUsage`** — lifetime `{usageCount, lastUsedAt}` counters.

Telemetry: `CLAUDE_CODE_ENABLE_TELEMETRY=1` is set but **no OTEL sink configured**. No `statsig/` dir; feature flags are GrowthBook caches inside `.claude.json`.

## 4. Models

No dedicated store. Derivable from: `settings.json` → `model: "claude-fable-5[1m]"` (only pin); per-turn `message.model` (ground truth); historical ids in `lastModelUsage`/`stats-cache.json` (`claude-opus-4-7`, `claude-opus-4-7[1m]`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`); per-job overrides in `jobs\<id>\state.json` `respawnFlags`.

## 5. Skills

No `skills/` dir at config root. Three sources:

1. **Plugin-bundled (dominant):** `plugins\cache\<marketplace>\<plugin>\<version>\skills\<category>\<name>\SKILL.md` (+ `deprecated/`, `in-progress/` subtrees).
2. **Project-level:** `<project>\.claude\skills\<name>\` (one instance found).
3. **Built-in:** shipped in the binary, not on disk.

State: `.claude.json` `skillUsage` (12 entries, `"plugin:skill"` keys); per-turn `attributionSkill`; `skillOverrides` in one project's settings.local.json.

## 6. Plugins

`D:\claude-config\plugins\`:

- `installed_plugins.json` — v2, `{"<plugin>@<marketplace>": [{scope, installPath, version, installedAt, gitCommitSha}]}`; **1 installed:** `mattpocock-skills@claude-plugins-official` 1.2.3.
- `known_marketplaces.json`; `marketplaces\<name>\.claude-plugin\marketplace.json` — **285-plugin catalog** `{name, description, author, category, source, homepage}`; `plugin-catalog-cache.json` (406 KB).
- `cache\<marketplace>\<plugin>\<version>\` — extracted plugin; three versions retained side-by-side with `.in_use` markers; `.last_inuse_sweep` GC stamp.
- **Enabled state lives in settings, not here:** global `settings.json` `enabledPlugins` + per-project `enabledPlugins` in 6+ project settings files. `.claude.json` `pluginUsage` tracks 10 plugins including uninstalled ones (historical record).

## 7. MCP servers

No `.mcp.json` anywhere under `D:\Claude` / `D:\Projects`. Four sources:

1. `.claude.json` `projects[<path>].mcpServers` — only 2/48 projects define stdio servers (`play_wright` via npx; `azure-devops` via cmd/npx).
2. No top-level user-scope `mcpServers`.
3. **claude.ai managed connectors (~12)** — definitions are server-side; locally only `mcp-needs-auth-cache.json` (display name → `{timestamp, id: mcpsrv_…}`) and `.claude.json` `claudeAiMcpEverConnected[]`.
4. Per-project enable/disable arrays on every project entry.

## 8. Settings & hooks

- **Global:** `settings.json` (412 B): `model`, `statusLine`, `extraKnownMarketplaces`, `enabledPlugins`. No hooks/permissions/env.
- **Org-pushed (read-only):** `remote-settings.json` (`permissions.defaultMode: "auto"`), `policy-limits.json` (restrictions, compliance taints, monitoring notice).
- **Per-project:** 21 `settings.json`/`settings.local.json` files across `D:\Claude`+`D:\Projects`; `permissions` in 19, `enabledPlugins` in 7, `hooks` in 2, `skillOverrides` in 1. No global CLAUDE.md.

## 9. Other domains

| Domain | Location | Notes |
|---|---|---|
| Prompt history | `history.jsonl` (205 KB) | `{display, timestamp, project, sessionId}` per submitted prompt — global, cheap, **best activity-feed source** |
| Memory | `projects\<p>\memory\` | 12 projects; `MEMORY.md` index + topic files |
| Plans | `plans\*.md` | 5 slug-named files, global, not project-namespaced |
| Background jobs | `jobs\<id>\` | `state.json` + `timeline.jsonl`; `jobs\pins.json` |
| Daemon | `daemon\`, `daemon.log`, `daemon.status.json` | last active 2026-07-26 |
| Config backups | `backups\.claude.json.backup.<epoch>` | 5 rolling snapshots — crude time-series of `last*` cost fields |
| Identity | `.claude.json` `oauthAccount` | email, org, seat/billing tier, rate-limit tiers. `.credentials.json` holds OAuth tokens — **never read/display** |
| App counters | `.claude.json` root | `numStartups`, `firstStartTime`, `githubRepoPaths{}` (project→repo links), `machineID` |

## Gaps to engineer around

1. **No central usage ledger** — build one (SQLite) by parsing transcripts incrementally.
2. **No cost in transcripts** — maintain a model→price table.
3. **`last*` fields are destructive** — only `backups/` preserves prior values.
4. **Transcripts are GC'd** — ingest incrementally; never assume re-derivable history.
5. **Project slugs are lossy** — join on `cwd`, not directory name.
6. **48 registry projects vs 22 on-disk** — decide the canonical set (ticket 03).
7. **Managed MCP connectors have no local definitions** — only auth cache + connection history.
8. **Effective config is scattered** across 21+ project settings files.
9. **Telemetry enabled, no sink** — OTEL collector is a future cleaner ledger source (out of scope for v1).
