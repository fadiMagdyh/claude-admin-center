# Domain model and source-reader design

Type: grilling
Status: open

## Question

Pin down the dashboard's domain model and how each domain is read. Using the data inventory (docs/research/claude-data-inventory.md), decide with the user:

- **Project identity:** `.claude.json` registry (48 entries) vs on-disk transcript dirs (22) — what is a "Project" in this dashboard, how are the two sets joined, and how do we survive the lossy directory-slug collisions (join on `cwd`)?
- **Session identity:** main transcripts vs subagent transcripts vs live-session registry (`sessions/*.json`) — what counts as a Session, and how are live vs historical sessions distinguished?
- **Per domain (all eight sections): read live from disk on request, or serve from the SQLite ledger?** Draft the rule (e.g. usage = ledger; config-ish domains = live reads with short cache).
- **MCP servers:** locally-defined stdio servers vs claude.ai managed connectors (no local definitions, only auth cache) — one list with provenance badges, or separate?
- **Skills/plugins:** how the three skill sources (plugin-bundled, project-level, built-in) unify into one Skills view; enabled-state resolution across global + 21 per-project settings files.
- Write the resulting glossary to `CONTEXT.md` (domain-modeling skill) and sketch one reader module per domain (codebase-design skill).

This is the keystone ticket — 06 and 07 are blocked on it, and section build slices graduate from fog after it and 04 resolve.
