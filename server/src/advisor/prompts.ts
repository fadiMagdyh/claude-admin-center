import type { AdvisorObjectType } from 'shared'
import type { AdvisorContext } from './context.js'

/**
 * One generic instruction template for every Advisor Run (locked design #1);
 * only the focus paragraph and the context block vary per object type.
 */
const GENERIC_TEMPLATE = `You are the advisor of Claude Admin Center, a local read-only dashboard over one developer's Claude Code setup. You are analyzing one object of that setup, described by the JSON context below.

Rules:
- You are strictly read-only. You may use Read, Grep and Glob on the listed file paths (and the config root) for deeper detail, but never modify anything.
- Ground every finding in the context or in files you actually read — do not speculate about data you cannot see.
- Produce 0 to 8 recommendations. Each one states a concrete finding and a concrete action the developer can take. Severity: "warning" for problems and waste, "suggestion" for worthwhile improvements, "info" for notable observations.
- Costs in the context are US dollars; token counts are raw. "Unpriced" means the model had no price-table entry.
- The summary is 2-4 sentences describing the object's state overall.`

/** The per-type focus paragraph appended to the generic template. */
const FOCUS: Record<AdvisorObjectType, string> = {
  project:
    'Focus: this Project\'s health and cost profile — session frequency and cost trend, memory hygiene (MEMORY.md), plugin/MCP enablement that looks unused or risky, and anything orphaned or stale.',
  session:
    'Focus: this one Session — cost and token efficiency (cache usage, model choice for the work done), Agent Run fan-out, and anything unusual worth flagging.',
  skill:
    'Focus: this Skill — whether its description and body are clear and well-scoped, whether usage data suggests it earns its place, and its status (deprecated/in-progress) versus reality.',
  plugin:
    'Focus: this plugin — whether it earns its place given usage and Ledger attribution, version/install state, bundled-skill quality signals, and enablement consistency across projects.',
  mcp:
    'Focus: this MCP Server — provenance and definition sanity, per-project enablement consistency, and staleness (auth age, disabled everywhere, defined but unused).',
  model:
    'Focus: this Model\'s usage economics — whether the spend, cache hit-rate and token mix look sane for this model tier, and whether cheaper or better-suited models would fit the observed workload.',
  overview:
    'Focus: the whole setup — the biggest cost drivers, dead weight (unused plugins/skills/servers, orphaned projects), configuration risks, and the top few things worth doing next. Prioritize ruthlessly.'
}

/** The full prompt for one Advisor Run, piped to the spawned Claude via stdin. */
export function buildPrompt(objectType: AdvisorObjectType, context: AdvisorContext): string {
  const paths =
    context.filePaths.length > 0
      ? `File paths you may read for deeper detail:\n${context.filePaths.map((p) => `- ${p}`).join('\n')}`
      : 'No extra file paths for this object — work from the context below.'
  return [GENERIC_TEMPLATE, FOCUS[objectType], paths, `Context:\n${context.summary}`].join('\n\n')
}
