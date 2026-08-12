import { useState } from 'react'
import type { UsageDay, UsageModelRow, UsageRange, UsageResponse, UsageTiles } from 'shared'
import { formatCost, formatTokens } from '../lib/format'
import { useFetchJson } from '../lib/useFetchJson'

const RANGES: Array<{ key: UsageRange; label: string }> = [
  { key: '7', label: '7d' },
  { key: '14', label: '14d' },
  { key: '30', label: '30d' },
  { key: 'all', label: 'All' }
]

/** Series colors by cost rank: the validated 4-slot set, then the muted grey for 5th+ Models. */
function seriesColor(rank: number): string {
  return rank < 4 ? `var(--s${rank + 1})` : 'var(--s-other)'
}

export function Usage() {
  const [range, setRange] = useState<UsageRange>('14')
  const [showTable, setShowTable] = useState(false)
  const data = useFetchJson<UsageResponse>(`/api/usage?range=${range}`)
  const label = RANGES.find((r) => r.key === range)!.label

  return (
    <div className="hud-page">
      <div className="hud-mod">
        <h3 className="hud-h">
          Module // Usage <span className="dim">— Ledger aggregates, all Sessions</span>
        </h3>
        <div className="hud-pills" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.key} className={`hud-pill${r.key === range ? ' on' : ''}`} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        {!data ? <p className="hud-note">READING LEDGER…</p> : <Tiles tiles={data.tiles} label={label} />}
      </div>

      {data && (
        <>
          <div className="hud-mod">
            <div className="hud-mod-head">
              <h3 className="hud-h">
                Daily spend by model <span className="dim">// {label}</span>
              </h3>
              <button className="hud-toggle" onClick={() => setShowTable((v) => !v)}>
                {showTable ? 'Chart' : 'Table'}
              </button>
            </div>
            {data.days.length === 0 ? (
              <p className="hud-note">NO TURNS IN RANGE</p>
            ) : showTable ? (
              <div className="hud-chart-scroll">
                <DailyTable days={data.days} models={data.models} />
              </div>
            ) : (
              <>
                <div className="hud-chart-scroll">
                  <StackedChart days={data.days} models={data.models} />
                </div>
                <Legend models={data.models} />
              </>
            )}
          </div>

          <div className="hud-mod">
            <div className="hud-mod-head">
              <h3 className="hud-h">
                Spend by model <span className="dim">// {label}</span>
              </h3>
              <span className="hud-note">LEDGER-BACKED — SURVIVES TRANSCRIPT GC</span>
            </div>
            {data.models.length === 0 ? <p className="hud-note">NO TURNS IN RANGE</p> : <ModelBars models={data.models} />}
            {data.unpriced.turns > 0 && (
              <p className="hud-note" style={{ marginTop: 9 }}>
                UNPRICED: {data.unpriced.turns} TURNS ({data.unpriced.models.join(', ')}) — tokens counted, excluded
                from dollar totals.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Tiles({ tiles, label }: { tiles: UsageTiles; label: string }) {
  const spend =
    tiles.costUsd === null && tiles.unpricedTurns === 0
      ? '—'
      : `${tiles.unpricedTurns > 0 ? '≥ ' : ''}$${(tiles.costUsd ?? 0).toFixed(2)}`
  return (
    <div className="hud-tiles">
      <div className="hud-tile">
        <div className="lbl">Spend · {label}</div>
        <div className="val">{spend}</div>
        {tiles.unpricedTurns > 0 && <div className="sub">+ {tiles.unpricedTurns} unpriced turns</div>}
      </div>
      <div className="hud-tile">
        <div className="lbl">Tokens · {label}</div>
        <div className="val">{formatTokens(tiles.tokens)}</div>
        <div className="sub">{tiles.cachePct}% cache reads</div>
      </div>
      <div className="hud-tile">
        <div className="lbl">Sessions · {label}</div>
        <div className="val">{tiles.sessions}</div>
      </div>
      <div className="hud-tile">
        <div className="lbl">Ledger</div>
        <div className="val">{tiles.historyDays} days</div>
        <div className="sub">history survives GC</div>
      </div>
    </div>
  )
}

/** "2026-08-11" → "Aug 11" in the viewer's locale. */
function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Grid ceiling and ticks: clean 1/2/5 × 10^k steps, at most five, covering the peak day. */
function chartScale(maxValue: number): { gridMax: number; ticks: number[] } {
  const floor = Math.max(maxValue, 0.03)
  const power = 10 ** Math.floor(Math.log10(floor / 5))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s * 5 >= floor) ?? 10 * power
  const count = Math.max(1, Math.ceil(floor / step))
  return { gridMax: count * step, ticks: Array.from({ length: count }, (_, i) => (i + 1) * step) }
}

function tickLabel(value: number): string {
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`
}

/** Bar with a 4px-rounded data-end at the top and a square baseline. */
function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= r) return `M${x},${y} h${w} v${h} h${-w} Z`
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

function StackedChart({ days, models }: { days: UsageDay[]; models: UsageModelRow[] }) {
  const rank = new Map(models.map((m, i) => [m.model, i]))
  const H = 210
  const padL = 46
  const padR = 6
  const padT = 8
  const padB = 20
  const slot = Math.max(12, Math.min(46, Math.floor(652 / days.length)))
  const W = padL + padR + slot * days.length
  const innerH = H - padT - padB
  const barW = Math.max(6, Math.round(slot * 0.62))
  const { gridMax, ticks } = chartScale(Math.max(...days.map((d) => d.total)))
  const labelEvery = Math.max(1, Math.ceil(days.length / 14)) * 2

  return (
    <svg
      className="hud-chart"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Daily spend by model over ${days.length} days`}
    >
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="rgba(56, 214, 245, 0.35)" strokeWidth="1" />
      {ticks.map((tick) => {
        const y = padT + innerH - (tick / gridMax) * innerH
        return (
          <g key={tick}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(56, 214, 245, 0.12)" strokeWidth="1" />
            <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="10" fill="var(--muted)">
              {tickLabel(tick)}
            </text>
          </g>
        )
      })}
      {days.map((day, dayIndex) => {
        const x = Math.round(padL + dayIndex * slot + (slot - barW) / 2)
        const segments = [...day.perModel]
          .filter((segment) => segment.cost > 0)
          .sort((a, b) => (rank.get(a.model) ?? 99) - (rank.get(b.model) ?? 99))
        let yCursor = padT + innerH
        return (
          <g key={day.day}>
            {segments.map((segment, segmentIndex) => {
              const h = Math.max((segment.cost / gridMax) * innerH, 1.5)
              const y = yCursor - h
              yCursor = y - 2 // 2px surface gap between stacked segments
              const fill = seriesColor(rank.get(segment.model) ?? 99)
              const tip = `${dayLabel(day.day)} · ${segment.model} · $${segment.cost.toFixed(2)}${
                segment.unpricedTurns > 0 ? ` + ${segment.unpricedTurns} unpriced` : ''
              }`
              const isTop = segmentIndex === segments.length - 1
              return isTop ? (
                <path key={segment.model} d={roundedTopRect(x, y, barW, h, 3)} fill={fill}>
                  <title>{tip}</title>
                </path>
              ) : (
                <rect key={segment.model} x={x} y={y} width={barW} height={h} fill={fill}>
                  <title>{tip}</title>
                </rect>
              )
            })}
            {dayIndex % labelEvery === 0 && (
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {dayLabel(day.day)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Legend({ models }: { models: UsageModelRow[] }) {
  return (
    <div className="hud-legend">
      {models.map((model, i) => (
        <span className="chip" key={model.model}>
          <span className="sw" style={{ background: seriesColor(i) }} />
          {model.model}
          {model.longContext && <span className="hud-badge longctx">incl. [1m]</span>}
        </span>
      ))}
    </div>
  )
}

/** The chart's data as a dense table — every tooltip value reachable without hovering. */
function DailyTable({ days, models }: { days: UsageDay[]; models: UsageModelRow[] }) {
  return (
    <table className="hud-table">
      <thead>
        <tr>
          <th>Day</th>
          {models.map((model) => (
            <th className="num" key={model.model}>
              {model.model}
            </th>
          ))}
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => {
          const byModel = new Map(day.perModel.map((m) => [m.model, m]))
          const unpricedTurns = day.perModel.reduce((sum, m) => sum + m.unpricedTurns, 0)
          return (
            <tr key={day.day}>
              <td className="dim">{dayLabel(day.day)}</td>
              {models.map((model) => {
                const cell = byModel.get(model.model)
                return (
                  <td className="num" key={model.model}>
                    {cell && cell.cost > 0 ? `$${cell.cost.toFixed(2)}` : '—'}
                  </td>
                )
              })}
              <td className="num">
                <b>{formatCost(day.total > 0 || unpricedTurns === 0 ? day.total : null, unpricedTurns)}</b>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ModelBars({ models }: { models: UsageModelRow[] }) {
  const max = Math.max(...models.map((model) => model.costUsd ?? 0))
  return (
    <>
      {models.map((model, i) => (
        <div className="hud-hbar-row" key={model.model}>
          <span className="m">
            {model.model}
            {model.longContext && <span className="hud-badge longctx">incl. [1m]</span>}
          </span>
          <div className="hud-hbar-track">
            <div
              className="hud-hbar"
              style={{ width: `${max > 0 ? (((model.costUsd ?? 0) / max) * 100).toFixed(1) : 0}%`, background: seriesColor(i) }}
              title={`${model.model} · ${model.turns} turns · in ${formatTokens(model.inputTokens)} / out ${formatTokens(
                model.outputTokens
              )} / cache ${formatTokens(model.cacheRead + model.cacheWrite)}`}
            />
          </div>
          <span className="hud-hbar-val">{formatCost(model.costUsd, model.unpricedTurns)}</span>
        </div>
      ))}
    </>
  )
}
