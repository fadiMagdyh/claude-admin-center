import { Hono } from 'hono'
import type { HealthResponse } from 'shared'
import { activity } from './routes/activity.js'
import { advisor } from './routes/advisor.js'
import { mcp } from './routes/mcp.js'
import { models } from './routes/models.js'
import { overview } from './routes/overview.js'
import { plugins } from './routes/plugins.js'
import { projects } from './routes/projects.js'
import { sessions } from './routes/sessions.js'
import { skills } from './routes/skills.js'
import { usage } from './routes/usage.js'

export const app = new Hono()

app.get('/api/health', (c) => {
  const body: HealthResponse = { status: 'ok' }
  return c.json(body)
})

app.route('/api/activity', activity)
app.route('/api/advisor', advisor)
app.route('/api/mcp', mcp)
app.route('/api/models', models)
app.route('/api/overview', overview)
app.route('/api/plugins', plugins)
app.route('/api/projects', projects)
app.route('/api/sessions', sessions)
app.route('/api/skills', skills)
app.route('/api/usage', usage)
