# Headless Claude invocation from Node on Windows — research findings (2026-08-11)

Resolves ticket [01-research-headless-claude](../../.scratch/admin-center-v1/issues/01-research-headless-claude.md). Sources: official docs (code.claude.com/docs — headless, cli-reference, structured-outputs, sessions, env-vars, errors, permissions). **All load-bearing flags verified present in the local CLI (v2.1.227) via `claude --help`:** `--json-schema`, `--no-session-persistence`, `--permission-mode`, `--allowedTools`, `--bare`, `--add-dir`, `--output-format`.

## 1. Mechanism: `claude -p`, not the Agent SDK

Print mode is built for spawn-analyze-exit runs: one subprocess, no persistent loop, streaming available. The Agent SDK (`@anthropic-ai/claude-agent-sdk`) earns its setup cost only for persistent multi-turn agents with hooks — overkill for advisor runs. **Decision input: use `claude -p` spawned via `child_process`.**

## 2. Output contract

- `--output-format json` returns `{result, session_id, usage{input_tokens, output_tokens, …}, total_cost_usd, …}`.
- `--output-format stream-json` emits NDJSON events (raw API `stream_event`s, final `result` line) — usable for live progress in the UI.
- **Structured recommendations:** `--json-schema '<schema>'` + `--output-format json` forces output validated against our schema, returned in a `structured_output` field; schema-match failure returns an error subtype rather than junk. This is the advisor's output contract mechanism.
- `total_cost_usd` is a **client-side estimate** from bundled pricing tables — fine for display, not billing-grade; our ledger's own price table (see model-pricing.md) is the consistent source.

## 3. Read-only safety

`--allowedTools "Read,Grep,Glob" --permission-mode dontAsk` — pre-approve only read tools; everything else is hard-denied without prompting (headless never hangs on a permission prompt). `--disallowedTools` available as a belt-and-braces deny list. Never use bypass-permissions for advisor runs. (Exact permission-mode value names should be re-checked against `claude --help` at implementation time.)

## 4. Context passing (Windows)

- Short context: inline in the `-p` prompt argument.
- Large context: pipe via **stdin** (≤10 MB, clear error + exit 1 beyond; disconnected-stdin crash fixed in v2.1.211, we're on 2.1.227).
- File-based: prompt references paths + `--add-dir "D:\claude-config"` grants directory read access.
- PowerShell quoting: prefer stdin piping or single-quoted prompts to avoid escaping problems.

## 5. Transcript pollution — solved

- **`--no-session-persistence`** skips writing the transcript entirely — advisor runs leave no trace in the data the dashboard displays. Recommended default.
- **`--bare`** additionally skips hooks, plugins, skills, MCP servers, CLAUDE.md and project settings — reproducible advisor behavior independent of the user's setup. Caveat: docs pair `--bare` with `ANTHROPIC_API_KEY` (no OAuth); verify locally whether bare mode works with the existing OAuth login before committing to it — if not, drop `--bare` and keep `--no-session-persistence` + a dedicated cwd.
  - **Verified 2026-08-12 (advisor build, #19):** `--bare` with OAuth login fails — `claude -p "say ok" --bare …` exits 1 with `"Not logged in · Please run /login"` (`terminal_reason: api_error`); the flag's own help confirms auth is strictly `ANTHROPIC_API_KEY`/apiKeyHelper in bare mode. Dropped per the fallback; the advisor uses `--no-session-persistence` + read-only tool allowlist. `--permission-mode dontAsk` verified as a valid choice in `claude --help`.
- A separate `CLAUDE_CONFIG_DIR` is NOT recommended: credentials aren't shared across config dirs and it just relocates the pollution.

## 6. Model, latency, cost, concurrency

- `--model haiku` for cheap default checks; allow opt-in to a bigger model per run.
- Expected E2E ~1–2 s spawn overhead + generation time; short Haiku analysis ≈ $0.0002–0.0005.
- No documented parallel-process limit; API rate limits are the real cap. Start with a small queue (concurrency 2–3) and observe.

## 7. Errors

- Exit 0 success; 1 general failure (auth, denied tool, >10 MB stdin, model not found); 143 SIGTERM.
- Mid-response API failure keeps partial text + notice, exits 0 — check for completeness.
- 429s are retried automatically (up to 10×, exponential backoff) before surfacing.
- `API_TIMEOUT_MS` env controls per-request timeout (default 10 min); the server should impose its own overall run timeout + kill.

## Reference invocation (starting point for ticket 07)

```bash
claude -p "<prompt>" \
  --output-format json \
  --json-schema "<recommendations schema>" \
  --model haiku \
  --allowedTools "Read,Grep,Glob" \
  --permission-mode dontAsk \
  --no-session-persistence \
  --add-dir "D:\claude-config"
```
