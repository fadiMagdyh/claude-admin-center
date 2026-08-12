import { SparkIcon } from './SparkIcon'

/** The object an Advisor Run is asked about; omitted for the full-setup sweep. */
export type AdvisorTarget = {
  objectType: string
  objectKey: string
  title: string
}

/**
 * Right-side HUD readout panel. UI stub for now — the advisor ticket wires the
 * real Advisor Run pipeline into it.
 */
export function AdvisorPanel({ target, onClose }: { target?: AdvisorTarget; onClose: () => void }) {
  return (
    <aside className="hud-adv">
      <div className="dhead">
        <span style={{ color: 'var(--cyan)' }}>
          <SparkIcon />
        </span>
        <b>ADVISOR // {target ? target.title.toUpperCase() : 'FULL SWEEP'}</b>
        <button className="x" onClick={onClose} aria-label="Close advisor">
          ×
        </button>
      </div>
      {target && (
        <p className="hud-note">
          TARGET · {target.objectType} · {target.objectKey}
        </p>
      )}
      <p className="hud-note">ADVISOR OFFLINE — pipeline lands with the advisor build.</p>
    </aside>
  )
}
