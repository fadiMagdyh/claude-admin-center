import type { AdvisorTarget } from './AdvisorPanel'
import { SparkIcon } from './SparkIcon'

/** The per-row spark button that opens the AdvisorPanel targeted at one object. */
export function AskButton({
  title,
  target,
  onAsk
}: {
  title: string
  target: AdvisorTarget
  onAsk: (target: AdvisorTarget) => void
}) {
  return (
    <button
      className="hud-ask"
      aria-label={`Ask Claude about ${title}`}
      onClick={(event) => {
        event.stopPropagation()
        onAsk(target)
      }}
    >
      <SparkIcon />
    </button>
  )
}
