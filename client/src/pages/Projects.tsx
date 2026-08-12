import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ProjectDetailResponse, ProjectRow, ProjectsResponse } from 'shared'
import { AdvisorPanel, type AdvisorTarget } from '../components/AdvisorPanel'
import { AskButton } from '../components/AskButton'
import { SparkIcon } from '../components/SparkIcon'
import { formatCost, formatTokens, formatWhen } from '../lib/format'
import { useFetchJson } from '../lib/useFetchJson'

export function Projects() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [advisorTarget, setAdvisorTarget] = useState<AdvisorTarget | null>(null)
  const cwd = searchParams.get('cwd')

  return (
    <div className="hud-page">
      {cwd ? (
        <ProjectDetail cwd={cwd} onBack={() => setSearchParams({})} onAsk={setAdvisorTarget} />
      ) : (
        <ProjectList onOpen={(path) => setSearchParams({ cwd: path })} onAsk={setAdvisorTarget} />
      )}
      {advisorTarget && <AdvisorPanel target={advisorTarget} onClose={() => setAdvisorTarget(null)} />}
    </div>
  )
}

function ProjectList({ onOpen, onAsk }: { onOpen: (path: string) => void; onAsk: (target: AdvisorTarget) => void }) {
  const data = useFetchJson<ProjectsResponse>('/api/projects')

  return (
    <div className="hud-mod">
      <h3 className="hud-h">
        Module // Projects <span className="dim">— registry + disk, joined on cwd</span>
      </h3>
      {!data ? (
        <p className="hud-note">READING REGISTRY…</p>
      ) : (
        <>
          <div className="hud-strip">
            <span>
              <b>{data.registryCount}</b> REGISTRY
            </span>
            <span>
              <b>{data.orphanCount}</b> ORPHANED
            </span>
            <span>
              <b>{data.liveCount}</b> LIVE
            </span>
          </div>
          <table className="hud-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Path</th>
                <th className="num">Sess 30d</th>
                <th>Last active</th>
                <th className="num">30d cost</th>
                <th aria-label="Ask Claude" />
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project) => (
                <tr
                  key={project.path}
                  className={project.orphaned ? undefined : 'click'}
                  onClick={project.orphaned ? undefined : () => onOpen(project.path)}
                >
                  <td className="pname">
                    {project.name}
                    <ProjectBadges project={project} />
                  </td>
                  <td className="ppath">{project.orphaned ? `projects/${project.path}` : project.path}</td>
                  <td className="num">{project.ledger30d?.sessions ?? '—'}</td>
                  <td className="dim">{formatWhen(project.lastActiveMs)}</td>
                  <td className="num">
                    {project.ledger30d ? formatCost(project.ledger30d.costUsd, project.ledger30d.unpricedTurns) : '—'}
                  </td>
                  <td>
                    <AskButton
                      title={project.name}
                      target={{ objectType: 'project', objectKey: project.path, title: project.name }}
                      onAsk={onAsk}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function ProjectDetail({
  cwd,
  onBack,
  onAsk
}: {
  cwd: string
  onBack: () => void
  onAsk: (target: AdvisorTarget) => void
}) {
  const data = useFetchJson<ProjectDetailResponse>(`/api/projects/detail?cwd=${encodeURIComponent(cwd)}`)

  if (!data) {
    return (
      <>
        <button className="hud-back" onClick={onBack}>
          ‹ PROJECTS
        </button>
        <div className="hud-mod">
          <p className="hud-note">READING PROJECT…</p>
        </div>
      </>
    )
  }

  const { project, sessions, enablement, memory } = data
  const enabledCount = enablement.filter((e) => e.on).length

  return (
    <>
      <button className="hud-back" onClick={onBack}>
        ‹ PROJECTS
      </button>

      <div className="hud-mod">
        <div className="hud-detailhead">
          <h2>{project.name}</h2>
          <ProjectBadges project={project} />
          <button
            className="hud-ask-wide"
            style={{ marginLeft: 'auto' }}
            onClick={() => onAsk({ objectType: 'project', objectKey: project.path, title: project.name })}
          >
            <SparkIcon /> Ask Claude
          </button>
        </div>
        <p className="hud-note">{project.path}</p>
        <div className="hud-strip" style={{ marginTop: 8, marginBottom: 0 }}>
          <span>
            <b>{project.ledger30d?.sessions ?? '—'}</b> SESSIONS 30D
          </span>
          <span>
            <b>{project.ledger30d ? formatTokens(project.ledger30d.tokens) : '—'}</b> TOKENS 30D
          </span>
          <span>
            <b>{project.ledger30d ? formatCost(project.ledger30d.costUsd, project.ledger30d.unpricedTurns) : '—'}</b>{' '}
            SPEND 30D
          </span>
          <span>
            <b>
              {enabledCount}/{enablement.length}
            </b>{' '}
            ENABLED
          </span>
        </div>
      </div>

      <div className="hud-mod">
        <h3 className="hud-h">
          Sessions <span className="dim">// Ledger records + live registry</span>
        </h3>
        {sessions.length === 0 ? (
          <p className="hud-note">NO LEDGER SESSIONS FOR THIS PROJECT</p>
        ) : (
          <table className="hud-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>ID</th>
                <th>When</th>
                <th className="num">Agent runs</th>
                <th className="num">Tokens</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.sessionId}>
                  <td className="pname">
                    {session.title ?? 'Untitled session'}
                    {session.live && <span className="hud-badge live">live</span>}
                    {session.transcriptGone && <span className="hud-badge gc">ledger only</span>}
                  </td>
                  <td className="ppath">{session.sessionId.slice(0, 8)}…</td>
                  <td className="dim">{formatWhen(session.lastTs ? Date.parse(session.lastTs) : null)}</td>
                  <td className="num">{session.agentRuns > 0 ? `${session.agentRuns} rolled up` : '—'}</td>
                  <td className="num">{formatTokens(session.tokens)}</td>
                  <td className="num">{formatCost(session.costUsd, session.unpricedTurns)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="hud-mod">
        <h3 className="hud-h">Effective enablement</h3>
        {enablement.map((row) => (
          <div className="hud-enab" key={`${row.kind}:${row.name}`}>
            <span className={row.on ? 'hud-dot-on' : 'hud-dot-off'} />
            <span>{row.name}</span>
            <span className="kind">{row.kind}</span>
            <span className="scope">{row.scope}</span>
          </div>
        ))}
        <p className="hud-note" style={{ marginTop: 9 }}>
          Resolved lazily: global settings + this project's overrides.
        </p>
      </div>

      <div className="hud-mod">
        <h3 className="hud-h">
          Memory <span className="dim">// projects/&lt;slug&gt;/memory</span>
        </h3>
        <p className="hud-note">
          {memory
            ? `${memory.hasMemoryMd ? 'MEMORY.md · ' : ''}${memory.fileCount} ${memory.fileCount === 1 ? 'file' : 'files'} · updated ${formatWhen(memory.lastModifiedMs)}`
            : 'NO MEMORY DIRECTORY'}
        </p>
      </div>
    </>
  )
}

function ProjectBadges({ project }: { project: ProjectRow }) {
  return (
    <>
      {project.orphaned && <span className="hud-badge orphan">orphaned</span>}
      {project.live && <span className="hud-badge live">live</span>}
    </>
  )
}

