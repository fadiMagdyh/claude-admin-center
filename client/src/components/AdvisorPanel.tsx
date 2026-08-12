import { SparkIcon } from './SparkIcon'

/**
 * Right-side HUD readout panel. UI stub for now — the advisor ticket wires the
 * real Advisor Run pipeline into it.
 */
export function AdvisorPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="hud-adv">
      <div className="dhead">
        <span style={{ color: 'var(--cyan)' }}>
          <SparkIcon />
        </span>
        <b>ADVISOR // FULL SWEEP</b>
        <button className="x" onClick={onClose} aria-label="Close advisor">
          ×
        </button>
      </div>
      <p className="hud-note">ADVISOR OFFLINE — pipeline lands with the advisor build.</p>
    </aside>
  )
}
