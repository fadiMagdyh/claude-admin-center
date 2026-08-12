import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import type { OverviewResponse } from 'shared'
import { Landing } from './pages/Landing'
import { Projects } from './pages/Projects'
import { Sessions } from './pages/Sessions'
import { Usage } from './pages/Usage'
import { Models } from './pages/Models'
import { Skills } from './pages/Skills'
import { Plugins } from './pages/Plugins'
import { McpServers } from './pages/McpServers'
import { Activity } from './pages/Activity'

const SECTIONS = [
  { label: 'Projects', path: '/projects' },
  { label: 'Sessions', path: '/sessions' },
  { label: 'Usage', path: '/usage' },
  { label: 'Models', path: '/models' },
  { label: 'Skills', path: '/skills' },
  { label: 'Plugins', path: '/plugins' },
  { label: 'MCP Servers', path: '/mcp' },
  { label: 'Activity', path: '/activity' }
]

function App() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/overview')
      .then((res) => (res.ok ? (res.json() as Promise<OverviewResponse>) : null))
      .then((data) => {
        if (!cancelled && data) setOverview(data)
      })
      .catch(() => {
        // API down — the shell still renders with dim placeholders.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <header className="hud-topbar">
        <span>
          <Link to="/" style={{ color: 'inherit' }}>
            CLAUDE ADMIN CENTER
          </Link>{' '}
          <span className="dim">// OPERATIONS OVERVIEW</span>
        </span>
        <span>
          {overview?.configRoot ?? 'CONFIG ROOT …'} · <span className="ok">ALL SYSTEMS NOMINAL</span>
        </span>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Landing overview={overview} />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/models" element={<Models />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/plugins" element={<Plugins />} />
          <Route path="/mcp" element={<McpServers />} />
          <Route path="/activity" element={<Activity />} />
        </Routes>
      </main>

      <nav className="hud-dock">
        {SECTIONS.map((section) => (
          <NavLink
            key={section.path}
            to={section.path}
            className={({ isActive }) => `hud-dockbtn${isActive ? ' on' : ''}`}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

export default App
