import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ActivityEntry, ActivityResponse } from 'shared'
import { formatWhen } from '../lib/format'
import { useFetchJson } from '../lib/useFetchJson'

const LIMITS = [100, 500, 1000]
const PROMPT_PREVIEW_CHARS = 240

export function Activity() {
  const [limit, setLimit] = useState(LIMITS[0])
  const [project, setProject] = useState('') // '' = all projects
  const data = useFetchJson<ActivityResponse>(`/api/activity?limit=${limit}`)

  const entries = data?.entries ?? []
  const projects = distinctProjects(entries)
  const shown = project ? entries.filter((entry) => entry.project === project) : entries

  return (
    <div className="hud-page">
      <div className="hud-mod">
        <h3 className="hud-h">
          Module // Activity <span className="dim">— submitted prompts, live from history.jsonl</span>
        </h3>
        <div className="hud-pills" role="group" aria-label="Limit">
          {LIMITS.map((l) => (
            <button key={l} className={`hud-pill${l === limit ? ' on' : ''}`} onClick={() => setLimit(l)}>
              {l}
            </button>
          ))}
          <select
            className="hud-select"
            aria-label="Project"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {!data ? (
          <p className="hud-note">READING HISTORY…</p>
        ) : shown.length === 0 ? (
          <p className="hud-note">NO PROMPTS RECORDED</p>
        ) : (
          <>
            <div className="hud-strip">
              <span>
                <b>{shown.length}</b> PROMPTS
              </span>
              <span>
                <b>{projects.length}</b> PROJECTS
              </span>
            </div>
            <table className="hud-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Project</th>
                  <th>Prompt</th>
                  <th>Session</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((entry, i) => (
                  <ActivityRow key={`${entry.timestamp}-${i}`} entry={entry} />
                ))}
              </tbody>
            </table>
            {data.total > entries.length && (
              <p className="hud-note" style={{ marginTop: 9 }}>
                SHOWING THE NEWEST {entries.length} OF {data.total}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const truncated = entry.display.length > PROMPT_PREVIEW_CHARS
  return (
    <tr>
      <td className="dim" title={new Date(entry.timestamp).toLocaleString()}>
        {formatWhen(entry.timestamp)}
      </td>
      <td className="pname">
        {entry.project ? (
          <Link to={`/projects?cwd=${encodeURIComponent(entry.project)}`}>{entry.projectName}</Link>
        ) : (
          '—'
        )}
      </td>
      <td className="ppath prompt" title={truncated ? entry.display : undefined}>
        {truncated ? `${entry.display.slice(0, PROMPT_PREVIEW_CHARS)}…` : entry.display}
      </td>
      <td className="ppath">
        {entry.sessionId ? (
          <Link to={`/sessions?id=${encodeURIComponent(entry.sessionId)}`} title={entry.sessionId}>
            {entry.sessionId.slice(0, 8)}
          </Link>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}

/** The distinct projects in the loaded slice, for the filter dropdown, sorted by short name. */
function distinctProjects(entries: ActivityEntry[]): Array<{ path: string; name: string }> {
  const byPath = new Map<string, string>()
  for (const entry of entries) {
    if (entry.project) byPath.set(entry.project, entry.projectName)
  }
  return [...byPath].map(([path, name]) => ({ path, name })).sort((a, b) => a.name.localeCompare(b.name))
}
