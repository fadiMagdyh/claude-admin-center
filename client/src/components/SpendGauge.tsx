const R = 88

/**
 * Center spend ring. Shows "LEDGER OFFLINE" until the Ledger build starts
 * feeding spend14d; the ledger ticket also defines the ring-fill semantics
 * (there is no budget concept yet), so only the track is drawn for now.
 */
export function SpendGauge({ spend14d }: { spend14d: number | null }) {
  const label =
    spend14d === null ? '14-day spend $ unknown — ledger offline' : `14-day spend $${spend14d.toFixed(2)}`
  return (
    <svg className="hud-gauge" width="250" height="250" viewBox="0 0 250 250" role="img" aria-label={label}>
      <g className="rot">
        <circle cx="125" cy="125" r="112" fill="none" stroke="rgba(56,214,245,.3)" strokeWidth="1.5" strokeDasharray="2 7" />
      </g>
      <circle cx="125" cy="125" r={R} fill="none" stroke="rgba(56,214,245,.14)" strokeWidth="7" />
      {spend14d === null ? (
        <text x="125" y="122" textAnchor="middle" fontSize="13" letterSpacing="2" fill="var(--muted)">
          LEDGER OFFLINE
        </text>
      ) : (
        <text x="125" y="122" textAnchor="middle" fontSize="30" fontWeight="650" fill="var(--ink)">
          ${spend14d.toFixed(2)}
        </text>
      )}
      <text x="125" y="144" textAnchor="middle" fontSize="9" letterSpacing="3" fill="var(--muted)">
        14-DAY SPEND
      </text>
    </svg>
  )
}
