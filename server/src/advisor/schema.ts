import type { AdvisorOutput, Recommendation, RecommendationSeverity } from 'shared'

const SEVERITIES: RecommendationSeverity[] = ['info', 'suggestion', 'warning']

/**
 * The output contract passed to the spawned Claude via --json-schema: the CLI
 * validates the model's answer against it and returns it as structured_output,
 * so schema mismatch surfaces as an error — never junk in the UI.
 */
export const ADVISOR_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: SEVERITIES },
          finding: { type: 'string' },
          action: { type: 'string' }
        },
        required: ['severity', 'finding', 'action'],
        additionalProperties: false
      }
    }
  },
  required: ['summary', 'recommendations'],
  additionalProperties: false
} as const

/** Belt-and-braces re-check of the CLI-validated structured_output; null when it doesn't match. */
export function parseAdvisorOutput(value: unknown): AdvisorOutput | null {
  if (typeof value !== 'object' || value === null) return null
  const output = value as { summary?: unknown; recommendations?: unknown }
  if (typeof output.summary !== 'string' || !Array.isArray(output.recommendations)) return null
  const recommendations: Recommendation[] = []
  for (const item of output.recommendations) {
    const rec = item as { severity?: unknown; finding?: unknown; action?: unknown }
    if (
      !SEVERITIES.includes(rec.severity as RecommendationSeverity) ||
      typeof rec.finding !== 'string' ||
      typeof rec.action !== 'string'
    ) {
      return null
    }
    recommendations.push({ severity: rec.severity as RecommendationSeverity, finding: rec.finding, action: rec.action })
  }
  return { summary: output.summary, recommendations }
}
