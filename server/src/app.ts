import { Hono } from 'hono'
import type { HealthResponse } from 'shared'

export const app = new Hono()

app.get('/api/health', (c) => {
  const body: HealthResponse = { status: 'ok' }
  return c.json(body)
})
