import { Hono } from 'hono'
import { tryLedgerDb } from '../ledger/db.js'
import { resolveConfigRoot } from '../readers/configRoot.js'
import { getSession, listSessions } from '../readers/sessions.js'

export const sessions = new Hono()

sessions.get('/', (c) => {
  const cwd = c.req.query('cwd')
  const limitParam = c.req.query('limit')
  const limit = limitParam === undefined ? undefined : Number.parseInt(limitParam, 10)
  if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
    return c.json({ error: 'limit must be a positive integer' }, 400)
  }
  return c.json(listSessions(resolveConfigRoot(), tryLedgerDb(), { cwd, limit }))
})

// The sessionId travels as a query param, matching the projects detail pattern.
sessions.get('/detail', (c) => {
  const id = c.req.query('id')
  if (!id) return c.json({ error: 'id query param is required' }, 400)
  const detail = getSession(resolveConfigRoot(), tryLedgerDb(), id)
  if (!detail) return c.json({ error: 'no Ledger Session with this id' }, 404)
  return c.json(detail)
})
