Claude Instructions:

* don't assume anything, always ask for clarifications
* don't build anything from scratch make sure first there is no library or plugin that can do the same. 
* make the code readable by itself that claude will not need any documentation to understand 
* if any part of the repo works don't enhance it unless i explicitly asked for it
* don't over engineer the implementation, keep it simple and clean 
* if there was any mistakes or misunderstanding happened during sessions add it to lessons learned at the bottom to avoid it in the future
* there is only one developer for this project, so no need to PRs 











## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (fadiMagdyh/claude-admin-center), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Lessons Learned

* 2026-08-12: an agent pushed real usage/spend dollar figures into a commit message on this PUBLIC repo (scrubbed by amend + force-push). The dashboard's data (costs, tokens, session titles, paths) is personal — never paste real numbers or transcript content into commits, issues, or PRs; keep verification figures in local output only.









