import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import PQueue from 'p-queue'
import type { AdvisorHistoryResponse, AdvisorObjectType, AdvisorRunCreated, AdvisorRunModel } from 'shared'
import { assembleContext, type AdvisorContext } from '../advisor/context.js'
import { buildPrompt } from '../advisor/prompts.js'
import { spawnAdvisor, type AdvisorChild } from '../advisor/runner.js'
import {
  finishRun, getRun, insertRun, latestOkContextHash, listRuns, markCancelled, markRunning, runStatus, type StoredRun
} from '../advisor/store.js'
import { tryLedgerDb, type LedgerDb } from '../ledger/db.js'
import { resolveConfigRoot } from '../readers/configRoot.js'

const OBJECT_TYPES: AdvisorObjectType[] = ['project', 'session', 'skill', 'plugin', 'mcp', 'model', 'overview']
const RUN_MODELS: AdvisorRunModel[] = ['haiku', 'sonnet', 'opus']
const DEFAULT_MODEL: AdvisorRunModel = 'haiku'

/** At most two Advisor Runs spawn concurrently (locked design #4); the rest wait as queued. */
const queue = new PQueue({ concurrency: 2 })
/** Children of currently running runs, so cancel can kill the process tree. */
const activeChildren = new Map<string, AdvisorChild>()

export const advisor = new Hono()

advisor.post('/runs', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { objectType?: unknown; objectKey?: unknown; model?: unknown }
    | null
  if (!body || !OBJECT_TYPES.includes(body.objectType as AdvisorObjectType)) {
    return c.json({ error: `objectType must be one of ${OBJECT_TYPES.join(', ')}` }, 400)
  }
  if (typeof body.objectKey !== 'string' || body.objectKey === '') {
    return c.json({ error: 'objectKey must be a non-empty string' }, 400)
  }
  const model = (body.model ?? DEFAULT_MODEL) as AdvisorRunModel
  if (!RUN_MODELS.includes(model)) {
    return c.json({ error: `model must be one of ${RUN_MODELS.join(', ')}` }, 400)
  }
  const db = tryLedgerDb()
  if (!db) return c.json({ error: 'Ledger unavailable — Advisor Runs need it' }, 503)

  const objectType = body.objectType as AdvisorObjectType
  const objectKey = body.objectKey
  const configRoot = resolveConfigRoot()
  const context = assembleContext(configRoot, db, objectType, objectKey)

  const runId = randomUUID()
  insertRun(db, { runId, objectType, objectKey, model, contextHash: context.contextHash })
  void queue.add(() => executeRun(db, runId, objectType, model, configRoot, context))

  const created: AdvisorRunCreated = { runId }
  return c.json(created, 201)
})

advisor.get('/runs', (c) => {
  const objectType = c.req.query('objectType') as AdvisorObjectType | undefined
  const objectKey = c.req.query('objectKey')
  if (!objectType || !OBJECT_TYPES.includes(objectType) || !objectKey) {
    return c.json({ error: 'objectType and objectKey query params are required' }, 400)
  }
  const db = tryLedgerDb()
  if (!db) {
    const empty: AdvisorHistoryResponse = { runs: [], inputUnchanged: false }
    return c.json(empty)
  }
  const runs = listRuns(db, objectType, objectKey)
  const currentHash = assembleContext(resolveConfigRoot(), db, objectType, objectKey).contextHash
  const body: AdvisorHistoryResponse = {
    runs: runs.map((run, index) => ({ ...toApiRun(run), latest: index === 0 })),
    inputUnchanged: latestOkContextHash(db, objectType, objectKey) === currentHash
  }
  return c.json(body)
})

advisor.get('/runs/:id', (c) => {
  const db = tryLedgerDb()
  if (!db) return c.json({ error: 'Ledger unavailable' }, 503)
  const run = getRun(db, c.req.param('id'))
  if (!run) return c.json({ error: 'no Advisor Run with this id' }, 404)
  return c.json(toApiRun(run))
})

advisor.post('/runs/:id/cancel', (c) => {
  const db = tryLedgerDb()
  if (!db) return c.json({ error: 'Ledger unavailable' }, 503)
  const runId = c.req.param('id')
  const status = runStatus(db, runId)
  if (!status) return c.json({ error: 'no Advisor Run with this id' }, 404)
  if (!markCancelled(db, runId)) return c.json({ error: `run already ${status}` }, 409)
  activeChildren.get(runId)?.kill() // a queued run has no child; executeRun sees 'cancelled' and skips
  return c.json(toApiRun(getRun(db, runId)!))
})

/** One queue slot: skip if cancelled while queued, spawn, persist the outcome + Recommendations. */
async function executeRun(
  db: LedgerDb,
  runId: string,
  objectType: AdvisorObjectType,
  model: AdvisorRunModel,
  configRoot: string,
  context: AdvisorContext
): Promise<void> {
  if (runStatus(db, runId) !== 'queued') return
  markRunning(db, runId)
  const child = spawnAdvisor(buildPrompt(objectType, context), model, configRoot)
  activeChildren.set(runId, child)
  try {
    const result = await child.promise
    if (result.outcome === 'ok') {
      finishRun(db, runId, {
        status: 'ok',
        costUsd: result.costUsd,
        rawResult: result.rawResult,
        recommendations: result.output.recommendations
      })
    } else if (result.outcome === 'timeout') {
      finishRun(db, runId, { status: 'timeout' })
    } else {
      finishRun(db, runId, { status: 'error', error: result.error })
    }
  } finally {
    activeChildren.delete(runId)
  }
}

/** API responses never carry the context hash — "input unchanged" is computed server-side. */
function toApiRun(run: StoredRun): Omit<StoredRun, 'contextHash'> {
  const { contextHash: _hash, ...api } = run
  return api
}
