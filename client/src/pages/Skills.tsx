import { useState } from 'react'
import type { SkillRow, SkillSource, SkillsResponse } from 'shared'
import { AdvisorPanel, type AdvisorTarget } from '../components/AdvisorPanel'
import { AskButton } from '../components/AskButton'
import { formatWhen } from '../lib/format'
import { useFetchJson } from '../lib/useFetchJson'

type SourceFilter = 'all' | SkillSource

const FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'plugin', label: 'Plugin' },
  { key: 'project', label: 'Project' },
  { key: 'built-in', label: 'Built-in' }
]

export function Skills() {
  const [filter, setFilter] = useState<SourceFilter>('all')
  const [advisorTarget, setAdvisorTarget] = useState<AdvisorTarget | null>(null)
  const data = useFetchJson<SkillsResponse>('/api/skills')
  const rows = data?.skills.filter((skill) => filter === 'all' || skill.source === filter) ?? []

  return (
    <div className="hud-page">
      <div className="hud-mod">
        <h3 className="hud-h">
          Module // Skills <span className="dim">— all Skill Sources, all statuses</span>
        </h3>
        {!data ? (
          <p className="hud-note">READING SKILL SOURCES…</p>
        ) : (
          <>
            <div className="hud-pills" role="group" aria-label="Skill Source">
              {FILTERS.map((f) => (
                <button key={f.key} className={`hud-pill${f.key === filter ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
                  {f.label} ({f.key === 'all' ? data.skills.length : data.skills.filter((s) => s.source === f.key).length})
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <p className="hud-note">NO SKILLS IN THIS SOURCE</p>
            ) : (
              <table className="hud-table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Source</th>
                    <th>Origin</th>
                    <th className="num">Usage</th>
                    <th>Last used</th>
                    <th className="num">Ledger turns</th>
                    <th>Enabled</th>
                    <th aria-label="Ask Claude" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((skill) => (
                    <tr key={skill.key} className={skill.ghost ? 'ghost' : undefined}>
                      <td className="pname" title={skill.description ?? undefined}>
                        {skill.name}
                        {skill.status === 'deprecated' && <span className="hud-badge deprecated">deprecated</span>}
                        {skill.status === 'in-progress' && <span className="hud-badge inprog">in progress</span>}
                      </td>
                      <td>
                        <SourceBadge skill={skill} />
                      </td>
                      <td className="ppath" title={skill.projectPath ?? undefined}>
                        {originOf(skill)}
                      </td>
                      <td className="num">{skill.usageCount ?? '—'}</td>
                      <td className="dim">{formatWhen(lastActiveMs(skill))}</td>
                      <td className="num">{skill.ledgerTurns > 0 ? skill.ledgerTurns : '—'}</td>
                      <td>
                        <EnabledCell skill={skill} />
                      </td>
                      <td>
                        <AskButton
                          title={skill.name}
                          target={{ objectType: 'skill', objectKey: skill.key, title: skill.name }}
                          onAsk={setAdvisorTarget}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
      {advisorTarget && <AdvisorPanel target={advisorTarget} onClose={() => setAdvisorTarget(null)} />}
    </div>
  )
}

function SourceBadge({ skill }: { skill: SkillRow }) {
  const className = { plugin: 'src-plugin', project: 'src-project', 'built-in': 'src-builtin' }[skill.source]
  return <span className={`hud-badge ${className}`} style={{ marginLeft: 0 }}>{skill.source}</span>
}

/** The owning plugin, or the project's last path segment for a project skill. */
function originOf(skill: SkillRow): string {
  if (skill.projectPath) return skill.projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? skill.projectPath
  return skill.plugin ?? '—'
}

function EnabledCell({ skill }: { skill: SkillRow }) {
  return (
    <span className="hud-skill-enab">
      {skill.enabled === null ? (
        <span className="dim">—</span>
      ) : (
        <span className={skill.enabled ? 'hud-dot-on' : 'hud-dot-off'} title={skill.enabled ? 'enabled' : 'disabled'} />
      )}
      {skill.overriddenInProjects > 0 && (
        <span className="dim">overridden in {skill.overriddenInProjects} project{skill.overriddenInProjects > 1 ? 's' : ''}</span>
      )}
    </span>
  )
}

/** Newest activity signal: skillUsage hit vs newest attributed Ledger Turn. */
function lastActiveMs(skill: SkillRow): number | null {
  const ledgerMs = skill.ledgerLastTs ? Date.parse(skill.ledgerLastTs) : 0
  const newest = Math.max(skill.lastUsedAtMs ?? 0, ledgerMs)
  return newest > 0 ? newest : null
}
