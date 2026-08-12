import { Hono } from 'hono'
import { tryLedgerDb } from '../ledger/db.js'
import { resolveConfigRoot } from '../readers/configRoot.js'
import { listSkills } from '../readers/skills.js'

export const skills = new Hono()

skills.get('/', (c) => {
  return c.json(listSkills(resolveConfigRoot(), tryLedgerDb()))
})
