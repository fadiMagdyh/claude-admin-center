import { useState } from 'react'
import type { PluginRow, PluginsResponse } from 'shared'
import { AdvisorPanel, type AdvisorTarget } from '../components/AdvisorPanel'
import { AskButton } from '../components/AskButton'
import { formatWhen } from '../lib/format'
import { useFetchJson } from '../lib/useFetchJson'

export function Plugins() {
  const [advisorTarget, setAdvisorTarget] = useState<AdvisorTarget | null>(null)
  const data = useFetchJson<PluginsResponse>('/api/plugins')

  return (
    <div className="hud-page">
      <div className="hud-mod">
        <h3 className="hud-h">
          Module // Plugins <span className="dim">— installed + uninstalled history</span>
        </h3>
        {!data ? (
          <p className="hud-note">READING PLUGIN CACHE…</p>
        ) : data.plugins.length === 0 ? (
          <p className="hud-note">NO PLUGINS RECORDED</p>
        ) : (
          <table className="hud-table">
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Marketplace</th>
                <th>Version</th>
                <th className="num">Skills</th>
                <th className="num">Usage</th>
                <th>Last used</th>
                <th className="num">Ledger turns</th>
                <th>Enabled</th>
                <th>Status</th>
                <th aria-label="Ask Claude" />
              </tr>
            </thead>
            <tbody>
              {data.plugins.map((plugin) => (
                <tr key={plugin.key} className={plugin.installed ? undefined : 'ghost'}>
                  <td className="pname" title={plugin.description ?? undefined}>
                    {plugin.name}
                  </td>
                  <td className="dim">{plugin.marketplace || '—'}</td>
                  <td className="dim">{plugin.version ?? '—'}</td>
                  <td className="num">{plugin.installed ? plugin.skillCount : '—'}</td>
                  <td className="num">{plugin.usageCount ?? '—'}</td>
                  <td className="dim">{formatWhen(lastActiveMs(plugin))}</td>
                  <td className="num">{plugin.ledgerTurns > 0 ? plugin.ledgerTurns : '—'}</td>
                  <td>
                    <EnabledCell plugin={plugin} />
                  </td>
                  <td>
                    {plugin.installed ? (
                      <span className="hud-badge live" style={{ marginLeft: 0 }} title={plugin.installedAt ? `installed ${plugin.installedAt}` : undefined}>
                        installed
                      </span>
                    ) : (
                      <span className="hud-badge gc" style={{ marginLeft: 0 }} title="known only from pluginUsage history">
                        uninstalled
                      </span>
                    )}
                  </td>
                  <td>
                    <AskButton
                      title={plugin.name}
                      target={{ objectType: 'plugin', objectKey: plugin.key, title: plugin.name }}
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

function EnabledCell({ plugin }: { plugin: PluginRow }) {
  return (
    <span className="hud-skill-enab">
      {plugin.enabled === null ? (
        <span className="dim">—</span>
      ) : (
        <span className={plugin.enabled ? 'hud-dot-on' : 'hud-dot-off'} title={plugin.enabled ? 'enabled' : 'disabled'} />
      )}
      {plugin.overriddenInProjects > 0 && (
        <span className="dim">
          overridden in {plugin.overriddenInProjects} project{plugin.overriddenInProjects > 1 ? 's' : ''}
        </span>
      )}
    </span>
  )
}

/** Newest activity signal: pluginUsage hit vs newest attributed Ledger Turn. */
function lastActiveMs(plugin: PluginRow): number | null {
  const ledgerMs = plugin.ledgerLastTs ? Date.parse(plugin.ledgerLastTs) : 0
  const newest = Math.max(plugin.lastUsedAtMs ?? 0, ledgerMs)
  return newest > 0 ? newest : null
}
