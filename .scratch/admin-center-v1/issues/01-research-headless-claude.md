# Research: spawning headless Claude sessions from Node on Windows

Type: research
Status: claimed

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
