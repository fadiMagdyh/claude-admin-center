/** Relative time for table rows: minutes/hours today, then dates. */
export function formatWhen(epochMs: number | null): string {
  if (!epochMs) return '—'
  const ageMs = Date.now() - epochMs
  if (ageMs < 3_600_000) return `${Math.max(1, Math.round(ageMs / 60_000))}m ago`
  if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h ago`
  if (ageMs < 172_800_000) return 'yesterday'
  return new Date(epochMs).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(1)}B`
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`
  if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`
  return String(tokens)
}

/** The Unpriced policy: unpriced Turns are excluded from dollars and surfaced as a count. */
export function formatCost(costUsd: number | null, unpricedTurns: number): string {
  if (costUsd === null && unpricedTurns === 0) return '—'
  const dollars = `$${(costUsd ?? 0).toFixed(2)}`
  return unpricedTurns > 0 ? `≥ ${dollars} + ${unpricedTurns} unpriced` : dollars
}

/** A first→last span, e.g. "45s", "38m", "2h 14m", "3d 6h". */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return '—'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
