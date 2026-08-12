import { Hono } from 'hono'
import { tryLedgerDb } from '../ledger/db.js'
import { resolveConfigRoot } from '../readers/configRoot.js'
import { getProject, listProjects } from '../readers/projects.js'

export const projects = new Hono()

projects.get('/', (c) => {
  return c.json(listProjects(resolveConfigRoot(), tryLedgerDb()))
})

// cwd travels as a query param — it contains slashes and a drive colon.
projects.get('/detail', (c) => {
  const cwd = c.req.query('cwd')
  if (!cwd) return c.json({ error: 'cwd query param is required' }, 400)
  const detail = getProject(resolveConfigRoot(), tryLedgerDb(), cwd)
  if (!detail) return c.json({ error: 'no Registry entry for this cwd' }, 404)
  return c.json(detail)
})
