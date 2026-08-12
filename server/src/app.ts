import { Hono } from 'hono'
import type { HealthResponse } from 'shared'
import { overview } from './routes/overview.js'

export const app = new Hono()

app.get('/api/health', (c) => {
  const body: HealthResponse = { status: 'ok' }
  return c.json(body)
})

app.route('/api/overview', overview)
