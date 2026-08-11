# Advisor ("Ask Claude") design

Type: grilling
Status: open
Blocked by: 01, 03

## Question

Design the heart of the product: click an object's icon → a headless Claude session analyzes it → persisted recommendations render inline. Using ticket 01's invocation facts, decide with the user:

- **Per-object-type prompts:** what does Claude actually get asked for a Project vs a Session vs an MCP server vs a Skill…? One template per type with the object's data baked in, or one generic prompt + typed context?
- **Context assembly:** which data goes into the prompt per type (and size limits) — e.g. a Project gets its settings + memory index + recent session stats; a Skill gets its SKILL.md.
- **Output contract:** structured recommendations (severity, finding, suggested action) the UI can render — enforced how (JSON output / schema)?
- **Run management:** queue + concurrency cap, model choice per run (cheap default, opt-in deeper model), timeout/cancel, cost display per run.
- **Persistence:** advisor_runs + recommendations tables (same SQLite DB), "last checked" per object, history view, and re-check semantics (what changed since last run?).
- **Transcript segregation:** apply ticket 01's answer so advisor runs don't pollute the dashboard's own data.
