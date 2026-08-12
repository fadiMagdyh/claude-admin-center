import { serve } from '@hono/node-server'
import { app } from './app.js'
import { ledgerDb } from './ledger/db.js'
import { sweep, watch } from './ledger/ingest.js'
import { resolveConfigRoot } from './readers/configRoot.js'

const db = ledgerDb()
const configRoot = resolveConfigRoot()

const boot = sweep(db, configRoot)
console.log(`Ledger: swept ${boot.filesSeen} files, ${boot.newTurns} new turns (${boot.durationMs}ms)`)

watch(db, configRoot, (result) => {
  if (result.newTurns > 0) console.log(`Ledger: swept ${result.filesSeen} files, ${result.newTurns} new turns (${result.durationMs}ms)`)
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`API server running on http://localhost:${info.port}`)
})
