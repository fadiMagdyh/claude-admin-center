import { Hono } from 'hono'
import type { HealthResponse } from 'shared'
import { overview } from './routes/overview.js'
import { projects } from './routes/projects.js'

export const app = new Hono()

app.get('/api/health', (c) => {
  const body: HealthResponse = { status: 'ok' }
  return c.json(body)
})

app.route('/api/overview', overview)
app.route('/api/projects', projects)
