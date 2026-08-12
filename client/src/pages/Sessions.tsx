import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { SessionDetailResponse, SessionRow, SessionsResponse } from 'shared'
import { AdvisorPanel, type AdvisorTarget } from '../components/AdvisorPanel'
import { AskButton } from '../components/AskButton'
import { SparkIcon } from '../components/SparkIcon'
import { formatCost, formatDuration, formatTokens, formatWhen } from '../lib/format'
import { useFetchJson } from '../lib/useFetchJson'

export function Sessions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [advisorTarget, setAdvisorTarget] = useState<AdvisorTarget | null>(null)
  const id = searchParams.get('id')

  return (
    <div className="hud-page">
      {id ? (
        <SessionDetail id={id} onBack={() => setSearchParams({})} onAsk={setAdvisorTarget} />
      ) : (
        <SessionList onOpen={(sessionId) => setSearchParams({ id: sessionId })} onAsk={setAdvisorTarget} />
      )}
      {advisorTarget && <AdvisorPanel target={advisorTarget} onClose={() => setAdvisorTarget(null)} />}
    </div>
  )
}

function SessionList({ onOpen, onAsk }: { onOpen: (sessionId: string) => void; onAsk: (target: AdvisorTarget) => void }) {
  const data = useFetchJson<SessionsResponse>('/api/sessions')

  return (
    <div className="hud-mod">
      <h3 className="hud-h">
        Module // Sessions <span className="dim">— Ledger records + live registry</span>
      </h3>
      {!data ? (
        <p className="hud-note">READING LEDGER…</p>
      ) : (
        <>
          <div className="hud-strip">
            <span>
              <b>{data.total}</b> LEDGER SESSIONS
            </span>
            <span>
              <b>{data.liveCount}</b> LIVE
            </span>
            <span>
              <b>{data.ledgerOnlyCount}</b> LEDGER ONLY
            </span>
          </div>
          <table className="hud-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Project</th>
                <th>When</th>
                <th className="num">Agent runs</th>
                <th className="num">Tokens</th>
                <th className="num">Cost</th>
                <th aria-label="Ask Claude" />
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((session) => (
                <tr key={session.sessionId} className="click" onClick={() => onOpen(session.sessionId)}>
                  <td className="pname">
                    {titleOf(session)}
                    <SessionBadges session={session} />
                  </td>
                  <td className="ppath">{session.projectName ?? '—'}</td>
                  <td className="dim">{formatWhen(session.lastTs ? Date.parse(session.lastTs) : null)}</td>
                  <td className="num">{session.agentRuns > 0 ? `${session.agentRuns} rolled up` : '—'}</td>
                  <td className="num">{formatTokens(session.tokens)}</td>
                  <td className="num">{formatCost(session.costUsd, session.unpricedTurns)}</td>
                  <td>
                    <AskButton title={titleOf(session)} target={advisorTargetOf(session)} onAsk={onAsk} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > data.sessions.length && (
            <p className="hud-note" style={{ marginTop: 9 }}>
              SHOWING THE NEWEST {data.sessions.length} OF {data.total}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function SessionDetail({
  id,
  onBack,
  onAsk
}: {
  id: string
  onBack: () => void
  onAsk: (target: AdvisorTarget) => void
}) {
  const data = useFetchJson<SessionDetailResponse>(`/api/sessions/detail?id=${encodeURIComponent(id)}`)

  if (!data) {
    return (
      <>
        <button className="hud-back" onClick={onBack}>
          ‹ SESSIONS
        </button>
        <div className="hud-mod">
          <p className="hud-note">READING SESSION…</p>
        </div>
      </>
    )
  }

  const { session, models, agentRuns } = data

  return (
    <>
      <button className="hud-back" onClick={onBack}>
        ‹ SESSIONS
      </button>

      <div className="hud-mod">
        <div className="hud-detailhead">
          <h2>{titleOf(session)}</h2>
          <SessionBadges session={session} />
          <button
            className="hud-ask-wide"
            style={{ marginLeft: 'auto' }}
            onClick={() => onAsk(advisorTargetOf(session))}
          >
            <SparkIcon /> Ask Claude
          </button>
        </div>
        <p className="hud-note">
          {session.sessionId}
          {session.cwd && (
            <>
              {' · '}
              <Link to={`/projects?cwd=${encodeURIComponent(session.cwd)}`}>{session.projectName}</Link>
            </>
          )}
        </p>
        <div className="hud-strip" style={{ marginTop: 8, marginBottom: 0 }}>
          <span>
            <b>{session.turns}</b> TURNS
          </span>
          <span>
            <b>{formatTokens(session.tokens)}</b> TOKENS
          </span>
          <span>
            <b>{formatCost(session.costUsd, session.unpricedTurns)}</b> COST
          </span>
          <span>
            <b>{formatDuration(session.durationMs)}</b> DURATION
          </span>
        </div>
      </div>

      <div className="hud-mod">
        <h3 className="hud-h">
          Models <span className="dim">// per-model rollup for this Session</span>
        </h3>
        {models.length === 0 ? (
          <p className="hud-note">NO TURNS RECORDED</p>
        ) : (
          <table className="hud-table">
            <thead>
              <tr>
                <th>Model</th>
                <th className="num">Turns</th>
                <th className="num">Tokens</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.model}>
                  <td className="pname">{model.model}</td>
                  <td className="num">{model.turns}</td>
                  <td className="num">{formatTokens(model.tokens)}</td>
                  <td className="num">{formatCost(model.costUsd, model.unpricedTurns)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="hud-mod">
        <h3 className="hud-h">
          Agent runs <span className="dim">// usage rolled up into this Session</span>
        </h3>
        {agentRuns.length === 0 ? (
          <p className="hud-note">NO AGENT RUNS</p>
        ) : (
          <table className="hud-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th className="num">Turns</th>
                <th className="num">Tokens</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {agentRuns.map((run) => (
                <tr key={run.agentId}>
                  <td className="pname">{run.agentType ?? '—'}</td>
                  <td className="ppath">{run.description ?? '—'}</td>
                  <td className="num">{run.turns}</td>
                  <td className="num">{formatTokens(run.tokens)}</td>
                  <td className="num">{formatCost(run.costUsd, run.unpricedTurns)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function SessionBadges({ session }: { session: SessionRow }) {
  return (
    <>
      {session.live && <span className="hud-badge live">live</span>}
      {session.transcriptGone && <span className="hud-badge gc">ledger only</span>}
    </>
  )
}

function titleOf(session: SessionRow): string {
  return session.title ?? 'Untitled session'
}

function advisorTargetOf(session: SessionRow): AdvisorTarget {
  return { objectType: 'session', objectKey: session.sessionId, title: titleOf(session) }
}
