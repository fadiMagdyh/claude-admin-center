# Research: spawning headless Claude sessions from Node on Windows

Type: research
Status: resolved

## Question

The advisor feature spawns a headless Claude Code session per "Ask Claude" click and renders its recommendations. What is the right invocation mechanism and its exact contract? Resolve:

- `claude -p` (print mode) vs the Claude Agent SDK from Node — which fits a local server spawning short analysis runs on Windows, and why?
- Output contract: does `--output-format json` (or `stream-json`) include token usage and cost? What fields come back? How do we get *structured* recommendations out (JSON schema / forced tool use)?
- Safety: how to constrain the spawned session to read-only tools (`--allowedTools` / permission mode flags) so an advisor run can never mutate config.
- Context passing: prompt via stdin vs file references — what's reliable on Windows for multi-KB object context?
- **Transcript pollution:** spawned sessions will write their own transcripts/registry entries into `D:\claude-config` — the very data the dashboard displays. How do we segregate or tag advisor runs (separate `CLAUDE_CONFIG_DIR`? cwd convention? filter rule)?
- Cost/latency expectations per run, model selection flags (e.g. haiku for cheap checks), and sensible concurrency limits.
- Error handling: exit codes, timeouts, rate-limit behavior.

Answer feeds ticket 07 (advisor design).

## Answer

Full findings: [docs/research/headless-claude-invocation.md](../../../docs/research/headless-claude-invocation.md). Gist: use `claude -p` (not the Agent SDK) spawned from `child_process`; `--output-format json` returns result + usage + estimated cost, and `--json-schema` forces schema-validated `structured_output` — that's the recommendations contract. Read-only safety via `--allowedTools "Read,Grep,Glob" --permission-mode dontAsk`. Context via stdin (≤10 MB) or file refs + `--add-dir`. **Transcript pollution is solved by `--no-session-persistence`** (optionally + `--bare`, pending an OAuth-compatibility check at implementation); do not use a separate CLAUDE_CONFIG_DIR. Default `--model haiku` (~$0.0003/run), queue with concurrency 2–3, exit codes 0/1/143, 429s auto-retried. All flags verified present in local CLI 2.1.227.
