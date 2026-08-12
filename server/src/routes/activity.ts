import { Hono } from 'hono'
import { listActivity } from '../readers/activity.js'
import { resolveConfigRoot } from '../readers/configRoot.js'

export const activity = new Hono()

activity.get('/', (c) => {
  const project = c.req.query('project')
  const limitParam = c.req.query('limit')
  const limit = limitParam === undefined ? undefined : Number.parseInt(limitParam, 10)
  if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
    return c.json({ error: 'limit must be a positive integer' }, 400)
  }
  return c.json(listActivity(resolveConfigRoot(), { limit, project }))
})
