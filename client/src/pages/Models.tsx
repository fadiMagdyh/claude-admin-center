import { useState } from 'react'
import type { ModelRow, ModelsRange, ModelsResponse } from 'shared'
import { AdvisorPanel, type AdvisorTarget } from '../components/AdvisorPanel'
import { AskButton } from '../components/AskButton'
import { formatCost, formatTokens, formatWhen } from '../lib/format'
import { useFetchJson } from '../lib/useFetchJson'

const RANGES: Array<{ key: ModelsRange; label: string }> = [
  { key: '30', label: '30d' },
  { key: 'all', label: 'All' }
]

export function Models() {
  const [range, setRange] = useState<ModelsRange>('all')
  const [advisorTarget, setAdvisorTarget] = useState<AdvisorTarget | null>(null)
  const data = useFetchJson<ModelsResponse>(`/api/models?range=${range}`)

  return (
    <div className="hud-page">
      <div className="hud-mod">
        <h3 className="hud-h">
          Module // Models <span className="dim">— one row per base Model, [1m] collapsed</span>
        </h3>
        <div className="hud-pills" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.key} className={`hud-pill${r.key === range ? ' on' : ''}`} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        {!data ? (
          <p className="hud-note">READING LEDGER…</p>
        ) : data.models.length === 0 ? (
          <p className="hud-note">NO TURNS IN RANGE</p>
        ) : (
          <>
            <table className="hud-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Seen</th>
                  <th className="num">Turns</th>
                  <th className="num">Sessions</th>
                  <th className="num">Tokens</th>
                  <th className="num">Cost</th>
                  <th className="num">$/MTok in · out</th>
                  <th aria-label="Ask Claude" />
                </tr>
              </thead>
              <tbody>
                {data.models.map((model) => (
                  <tr key={model.model}>
                    <td className="pname">
                      {model.model}
                      {model.longContext && <span className="hud-badge longctx">incl. [1m]</span>}
                      {model.pinnedDefault && <span className="hud-badge pinned">pinned default</span>}
                      {model.unpricedTurns > 0 && <span className="hud-badge gc">unpriced</span>}
                    </td>
                    <td className="dim">{seenSpan(model)}</td>
                    <td className="num">{model.turns}</td>
                    <td className="num">{model.sessions}</td>
                    <td className="num" title={tokensTitle(model)}>
                      {formatTokens(model.tokens)}
                    </td>
                    <td className="num">{formatCost(model.costUsd, model.unpricedTurns)}</td>
                    <td className="num">
                      {model.price ? (
                        <span title={`cache read $${model.price.cacheRead}/MTok`}>
                          ${model.price.input} · ${model.price.output}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <AskButton
                        title={model.model}
                        target={{ objectType: 'model', objectKey: model.model, title: model.model }}
                        onAsk={setAdvisorTarget}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.unpriced.turns > 0 && (
              <p className="hud-note" style={{ marginTop: 9 }}>
                UNPRICED: {data.unpriced.turns} TURNS ({data.unpriced.models.join(', ')}) — tokens counted, excluded
                from dollar totals.
              </p>
            )}
          </>
        )}
      </div>
      {advisorTarget && <AdvisorPanel target={advisorTarget} onClose={() => setAdvisorTarget(null)} />}
    </div>
  )
}

/** First → last Turn, both relative ("Mar 12 → 2h ago"). */
function seenSpan(model: ModelRow): string {
  return `${formatWhen(Date.parse(model.firstTs))} → ${formatWhen(Date.parse(model.lastTs))}`
}

function tokensTitle(model: ModelRow): string {
  return `in ${formatTokens(model.inputTokens)} / out ${formatTokens(model.outputTokens)} / cache ${formatTokens(
    model.cacheRead + model.cacheWrite
  )}`
}
