import { useState } from 'react'
import type { OverviewResponse, OverviewSystem } from 'shared'
import { AdvisorPanel } from '../components/AdvisorPanel'
import { SparkIcon } from '../components/SparkIcon'
import { SpendGauge } from '../components/SpendGauge'
import { formatCost } from '../lib/format'

const SYSTEM_KIND_LABEL: Record<OverviewSystem['kind'], string> = {
  'mcp-local': 'MCP · LOCAL',
  plugin: 'PLUGIN',
  ledger: 'SQLITE'
}

function formatWhen(epochMs: number): string {
  const date = new Date(epochMs)
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function Landing({ overview }: { overview: OverviewResponse | null }) {
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const topProjects = overview?.projects.topByLastCost ?? []
  const maxCost = topProjects[0]?.lastCost ?? 0

  return (
    <>
      <div className="hud-grid">
        <section>
          <div className="hud-mod">
            <h3 className="hud-h">
              Top projects <span className="dim">// last session cost</span>
            </h3>
            {topProjects.length === 0 ? (
              <p className="hud-note">NO REGISTRY DATA</p>
            ) : (
              topProjects.map((p) => (
                <div className="hud-row" key={p.path} title={p.path}>
                  <span className="pn">{p.name}</span>
                  <div>
                    <div className="hud-bar" style={{ width: `${((p.lastCost / maxCost) * 100).toFixed(0)}%` }} />
                  </div>
                  <span className="pv">${p.lastCost.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
          <div className="hud-mod">
            <h3 className="hud-h">
              Systems <span className="dim">// MCP + plugins</span>
            </h3>
            {(overview?.systems ?? []).map((sys) => (
              <div className="hud-sys" key={`${sys.kind}:${sys.name}`}>
                <span className={`lamp ${sys.on ? 'on' : 'off'}`} />
                <span>{sys.name}</span>
                <span className="k">{SYSTEM_KIND_LABEL[sys.kind]}</span>
                <span className="s">{sys.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="hud-center">
          <SpendGauge spend14d={overview?.spend14d ?? null} />
          <div className="hud-readouts">
            <Readout value={overview?.tokens14d} label="TOKENS" />
            <Readout value={overview?.sessions14d} label="SESSIONS" />
            <Readout value={overview?.cachePct} label="CACHE" suffix="%" />
            <Readout value={overview?.projects.count} label="PROJECTS" />
          </div>
          <button className="hud-orb" onClick={() => setAdvisorOpen(true)} aria-label="Ask Claude — full system sweep">
            <SparkIcon />
          </button>
          <div className="hud-orb-label">Ask Claude // full sweep</div>
        </section>

        <section>
          <div className="hud-mod">
            <h3 className="hud-h">
              Model loadout <span className="dim">// 14d</span>
            </h3>
            <ModelLoadout models={overview?.models ?? []} />
          </div>
          <div className="hud-mod">
            <h3 className="hud-h">
              Live feed <span className="dim">// history.jsonl</span> <span className="hud-caret">▌</span>
            </h3>
            {(overview?.activity ?? []).length === 0 ? (
              <p className="hud-note">NO ACTIVITY</p>
            ) : (
              overview!.activity.map((entry, i) => (
                <div className="act-item" key={`${entry.timestamp}-${i}`}>
                  <div className="meta">
                    <span>{formatWhen(entry.timestamp)}</span>
                    <span className="proj">{entry.project}</span>
                  </div>
                  <div className="q">{entry.display}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {advisorOpen && <AdvisorPanel onClose={() => setAdvisorOpen(false)} />}
    </>
  )
}

/** 14d per-Model spend bars ([1m] collapsed server-side), scaled to the top Model. */
function ModelLoadout({ models }: { models: OverviewResponse['models'] }) {
  if (models.length === 0) return <p className="hud-note">NO LEDGER DATA — model spend lands after the first sweep.</p>
  const maxCost = Math.max(...models.map((m) => m.costUsd ?? 0))
  return (
    <>
      {models.map((m) => (
        <div className="hud-row" key={m.model} title={m.model}>
          <span className="pn">
            {m.model.replace(/^claude-/, '')}
            {m.longContext ? ' [1M]' : ''}
          </span>
          <div>
            <div className="hud-bar" style={{ width: `${maxCost > 0 ? (((m.costUsd ?? 0) / maxCost) * 100).toFixed(0) : 0}%` }} />
          </div>
          <span className="pv">{formatCost(m.costUsd, m.unpricedTurns)}</span>
        </div>
      ))}
    </>
  )
}

function Readout({ value, label, suffix = '' }: { value: number | null | undefined; label: string; suffix?: string }) {
  return (
    <div>
      <div className="v">{value == null ? '—' : `${value.toLocaleString()}${suffix}`}</div>
      <div className="l">{label}</div>
    </div>
  )
}
