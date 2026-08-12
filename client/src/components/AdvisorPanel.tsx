import { useCallback, useEffect, useState } from 'react'
import type { AdvisorHistoryResponse, AdvisorRunCreated, AdvisorRunModel } from 'shared'
import { formatWhen } from '../lib/format'
import { SparkIcon } from './SparkIcon'

/** The object an Advisor Run is asked about; omitted for the full-setup sweep. */
export type AdvisorTarget = {
  objectType: string
  objectKey: string
  title: string
}

/** The landing orb passes no target: the sweep runs against the synthetic 'overview' object. */
const FULL_SWEEP: AdvisorTarget = { objectType: 'overview', objectKey: 'overview', title: 'FULL SWEEP' }

const RUN_MODELS: AdvisorRunModel[] = ['haiku', 'sonnet', 'opus']
const POLL_MS = 2000

type HistoryRun = AdvisorHistoryResponse['runs'][number]

/** Right-side HUD readout panel: runs the Advisor pipeline against one target and renders its history. */
export function AdvisorPanel({ target, onClose }: { target?: AdvisorTarget; onClose: () => void }) {
  const { objectType, objectKey } = target ?? FULL_SWEEP
  const [history, setHistory] = useState<AdvisorHistoryResponse | null>(null)
  const [model, setModel] = useState<AdvisorRunModel>('haiku')
  const [requestError, setRequestError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/advisor/runs?objectType=${encodeURIComponent(objectType)}&objectKey=${encodeURIComponent(objectKey)}`
      )
      if (!res.ok) return
      const body = (await res.json()) as AdvisorHistoryResponse
      if (Array.isArray(body.runs)) setHistory(body)
    } catch {
      // API down — the panel keeps its loading note.
    }
  }, [objectType, objectKey])

  useEffect(() => {
    setHistory(null)
    void load()
  }, [load])

  const runs = history?.runs ?? []
  const activeRun = runs.find((run) => run.status === 'queued' || run.status === 'running')
  const latestDone = runs.find((run) => run.status !== 'queued' && run.status !== 'running')

  // Poll while a run is queued/running; the interval dies with the run (or the panel).
  const polling = activeRun !== undefined
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [polling, load])

  const startRun = async () => {
    setRequestError(null)
    try {
      const res = await fetch('/api/advisor/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectType, objectKey, model })
      })
      if (!res.ok) {
        setRequestError(`run request failed (${res.status})`)
        return
      }
      await (res.json() as Promise<AdvisorRunCreated>)
      await load()
    } catch {
      setRequestError('run request failed — API down?')
    }
  }

  const cancelRun = async (runId: string) => {
    try {
      await fetch(`/api/advisor/runs/${runId}/cancel`, { method: 'POST' })
    } catch {
      // API down — the next poll shows reality.
    }
    await load()
  }

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

      <div className="hud-adv-controls">
        <div className="hud-pills" role="group" aria-label="Advisor model">
          {RUN_MODELS.map((m) => (
            <button key={m} className={`hud-pill${m === model ? ' on' : ''}`} onClick={() => setModel(m)}>
              {m}
            </button>
          ))}
        </div>
        <button className="hud-ask-wide" onClick={() => void startRun()} disabled={activeRun !== undefined}>
          <SparkIcon /> Ask Claude
        </button>
      </div>
      {history?.inputUnchanged && <span className="hud-badge unchanged">input unchanged since last run</span>}
      {requestError && <p className="hud-note err">{requestError}</p>}

      {!history && <p className="hud-note">LOADING ADVISOR HISTORY…</p>}
      {history && runs.length === 0 && !requestError && (
        <p className="hud-note">NO ADVISOR RUNS YET — ask Claude to analyze this object.</p>
      )}

      {activeRun && (
        <div className="hud-adv-run">
          <p className="hud-note">
            <span className="hud-spin" aria-hidden>
              <SparkIcon />
            </span>{' '}
            RUN {activeRun.status.toUpperCase()} · {activeRun.model}
            <button className="hud-adv-cancel" onClick={() => void cancelRun(activeRun.runId)}>
              CANCEL
            </button>
          </p>
          <div className="hud-adv-skel" aria-hidden>
            <div />
            <div />
            <div />
          </div>
        </div>
      )}

      {latestDone && <RunReadout run={latestDone} />}

      {runs.length > 1 && (
        <div className="hud-adv-hist">
          <h4>HISTORY</h4>
          {runs.map((run) => (
            <div className="row" key={run.runId}>
              <span>{formatWhen(Date.parse(run.requestedAt))}</span>
              <span>{run.model}</span>
              <span>{run.status === 'ok' ? `${run.recommendations.length} recs` : run.status}</span>
              <span className="num">{formatRunCost(run.costUsd)}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

/** The latest finished run: summary + severity-badged Recommendation cards, or its failure note. */
function RunReadout({ run }: { run: HistoryRun }) {
  if (run.status !== 'ok') {
    return (
      <p className="hud-note err">
        LAST RUN {run.status.toUpperCase()}
        {run.error ? ` — ${run.error}` : ''}
      </p>
    )
  }
  return (
    <div className="hud-adv-result">
      {run.summary && <p className="hud-adv-summary">{run.summary}</p>}
      {run.recommendations.length === 0 && <p className="hud-note">NO RECOMMENDATIONS — looks healthy.</p>}
      {run.recommendations.map((rec, i) => (
        <div className={`hud-rec ${rec.severity}`} key={`${run.runId}-${i}`}>
          <span className="sev">{rec.severity}</span>
          <div className="finding">{rec.finding}</div>
          <div className="action">{rec.action}</div>
        </div>
      ))}
      <p className="hud-note">
        {run.model} · {formatWhen(Date.parse(run.requestedAt))} · {formatRunCost(run.costUsd)}
      </p>
    </div>
  )
}

/** The CLI's client-side estimate, labelled as such — Ledger pricing stays canonical. */
function formatRunCost(costUsd: number | null): string {
  return costUsd === null ? '—' : `est. $${costUsd.toFixed(4)}`
}
