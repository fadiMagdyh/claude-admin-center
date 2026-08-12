import { Hono } from 'hono'
import { tryLedgerDb } from '../ledger/db.js'
import { resolveConfigRoot } from '../readers/configRoot.js'
import { listPlugins } from '../readers/plugins.js'

export const plugins = new Hono()

plugins.get('/', (c) => {
  return c.json(listPlugins(resolveConfigRoot(), tryLedgerDb()))
})
