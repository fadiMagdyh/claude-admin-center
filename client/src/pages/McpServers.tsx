import { useState } from 'react'
import type { McpServerRow, McpServersResponse } from 'shared'
import { AdvisorPanel, type AdvisorTarget } from '../components/AdvisorPanel'
import { AskButton } from '../components/AskButton'
import { formatWhen } from '../lib/format'
import { useFetchJson } from '../lib/useFetchJson'

export function McpServers() {
  const [advisorTarget, setAdvisorTarget] = useState<AdvisorTarget | null>(null)
  const data = useFetchJson<McpServersResponse>('/api/mcp')

  return (
    <div className="hud-page">
      <div className="hud-mod">
        <h3 className="hud-h">
          Module // MCP Servers{' '}
          <span className="dim">
            {data ? `— ${data.localCount} local · ${data.managedCount} managed` : '— one list, whatever the provenance'}
          </span>
        </h3>
        {!data ? (
          <p className="hud-note">READING MCP SOURCES…</p>
        ) : data.servers.length === 0 ? (
          <p className="hud-note">NO MCP SERVERS KNOWN</p>
        ) : (
          <table className="hud-table">
            <thead>
              <tr>
                <th>Server</th>
                <th>Provenance</th>
                <th>Detail</th>
                <th>Enabled</th>
                <th aria-label="Ask Claude" />
              </tr>
            </thead>
            <tbody>
              {data.servers.map((server) => (
                <tr key={server.key}>
                  <td className="pname">{server.name}</td>
                  <td>
                    <span className={`hud-badge prov-${server.provenance}`} style={{ marginLeft: 0 }}>
                      {server.provenance}
                    </span>
                  </td>
                  <td>{server.provenance === 'local' ? <LocalDetail server={server} /> : <ManagedDetail server={server} />}</td>
                  <td>
                    <EnabledCell server={server} />
                  </td>
                  <td>
                    <AskButton
                      title={server.name}
                      target={{ objectType: 'mcp', objectKey: server.key, title: server.name }}
                      onAsk={setAdvisorTarget}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {advisorTarget && <AdvisorPanel target={advisorTarget} onClose={() => setAdvisorTarget(null)} />}
    </div>
  )
}

/** Local stdio definition: terse command summary plus the defining projects. */
function LocalDetail({ server }: { server: McpServerRow }) {
  return (
    <>
      {server.commandSummary ?? '—'}{' '}
      <span className="dim">
        in {server.definedInProjects.length} project{server.definedInProjects.length !== 1 ? 's' : ''}:{' '}
        {server.definedInProjects.join(', ')}
      </span>
    </>
  )
}

/** Managed connector: last auth from the auth cache plus the connected-ever flag. */
function ManagedDetail({ server }: { server: McpServerRow }) {
  return (
    <>
      <span className="dim">last auth</span> {formatWhen(server.lastAuthMs)}
      <span className={`hud-badge ${server.everConnected ? 'conn' : 'noconn'}`}>
        {server.everConnected ? 'connected' : 'never connected'}
      </span>
    </>
  )
}

/** Local rows summarize the per-project disable arrays; managed rows have no local enablement. */
function EnabledCell({ server }: { server: McpServerRow }) {
  if (server.provenance === 'managed') return <span className="dim">—</span>
  return (
    <span className="hud-skill-enab">
      {server.disabledInProjects === 0 ? (
        <span className="hud-dot-on" title="enabled in all defining projects" />
      ) : (
        <>
          <span className="hud-dot-off" title="disabled somewhere" />
          <span className="dim">
            disabled in {server.disabledInProjects} of {server.definedInProjects.length} defining project
            {server.definedInProjects.length !== 1 ? 's' : ''}
          </span>
        </>
      )}
    </span>
  )
}
