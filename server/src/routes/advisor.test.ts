import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdvisorRun } from 'shared'
import type { AdvisorSpawnResult } from '../advisor/runner.js'
import { app } from '../app.js'

const spawnAdvisorMock = vi.hoisted(() => vi.fn())

// Route tests never spawn a real claude: the runner module is fully mocked.
vi.mock('../advisor/runner.js', () => ({ spawnAdvisor: spawnAdvisorMock }))

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalLedgerDbPath = process.env.LEDGER_DB_PATH

let configRoot: string

beforeAll(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'advisor-routes-'))
  process.env.CLAUDE_CONFIG_DIR = configRoot
  process.env.LEDGER_DB_PATH = ':memory:'
})
afterAll(() => {
  process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  if (originalLedgerDbPath === undefined) delete process.env.LEDGER_DB_PATH
  else process.env.LEDGER_DB_PATH = originalLedgerDbPath
  rmSync(configRoot, { recursive: true, force: true })
})
beforeEach(() => {
  spawnAdvisorMock.mockReset()
})

const OK_RESULT: AdvisorSpawnResult = {
  outcome: 'ok',
  output: {
    summary: 'Model usage looks sane.',
    recommendations: [{ severity: 'suggestion', finding: 'F1', action: 'A1' }]
  },
  costUsd: 0.0042,
  rawResult: JSON.stringify({
    summary: 'Model usage looks sane.',
    recommendations: [{ severity: 'suggestion', finding: 'F1', action: 'A1' }]
  })
}

function mockResult(result: AdvisorSpawnResult) {
  spawnAdvisorMock.mockReturnValueOnce({ promise: Promise.resolve(result), kill: vi.fn() })
}

/** A child whose completion the test controls, standing in for a long-running claude. */
function mockHangingChild() {
  let resolve!: (result: AdvisorSpawnResult) => void
  const kill = vi.fn()
  spawnAdvisorMock.mockReturnValueOnce({ promise: new Promise<AdvisorSpawnResult>((r) => (resolve = r)), kill })
  return { resolve, kill }
}

async function postRun(objectKey: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await app.request('/api/advisor/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectType: 'model', objectKey, ...extra })
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { runId: string }).runId
}

async function getRun(runId: string): Promise<AdvisorRun> {
  const res = await app.request(`/api/advisor/runs/${runId}`)
  expect(res.status).toBe(200)
  return (await res.json()) as AdvisorRun
}

async function waitForStatus(runId: string, statuses: string[], timeoutMs = 3000): Promise<AdvisorRun> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const run = await getRun(runId)
    if (statuses.includes(run.status)) return run
    if (Date.now() > deadline) throw new Error(`run ${runId} stuck at ${run.status}`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('advisor routes', () => {
  it('runs the full pipeline: queued run finishes ok with Recommendations and cost', async () => {
    mockResult(OK_RESULT)
    const runId = await postRun('claude-fable-5')

    const run = await waitForStatus(runId, ['ok'])
    expect(run).toMatchObject({
      objectType: 'model',
      objectKey: 'claude-fable-5',
      model: 'haiku',
      status: 'ok',
      costUsd: 0.0042,
      summary: 'Model usage looks sane.',
      recommendations: [{ severity: 'suggestion', finding: 'F1', action: 'A1' }]
    })
    expect(run.finishedAt).not.toBeNull()
    expect(spawnAdvisorMock).toHaveBeenCalledWith(expect.stringContaining('claude-fable-5'), 'haiku', configRoot)
  })

  it('honours the per-run model override', async () => {
    mockResult(OK_RESULT)
    const runId = await postRun('claude-fable-5', { model: 'opus' })
    await waitForStatus(runId, ['ok'])
    expect(spawnAdvisorMock).toHaveBeenCalledWith(expect.any(String), 'opus', configRoot)
  })

  it('persists error and timeout outcomes', async () => {
    mockResult({ outcome: 'error', error: 'claude exited 1: boom' })
    const errorRun = await waitForStatus(await postRun('model-err'), ['error'])
    expect(errorRun.error).toBe('claude exited 1: boom')

    mockResult({ outcome: 'timeout' })
    const timeoutRun = await waitForStatus(await postRun('model-to'), ['timeout'])
    expect(timeoutRun.error).toBeNull()
  })

  it('reports history newest first with the latest flag and inputUnchanged', async () => {
    mockResult(OK_RESULT)
    const first = await postRun('model-hist')
    await waitForStatus(first, ['ok'])
    mockResult({ outcome: 'error', error: 'boom' })
    const second = await postRun('model-hist')
    await waitForStatus(second, ['error'])

    const res = await app.request('/api/advisor/runs?objectType=model&objectKey=model-hist')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { runs: Array<AdvisorRun & { latest: boolean }>; inputUnchanged: boolean }
    expect(body.runs.map((run) => [run.runId, run.latest])).toEqual([
      [second, true],
      [first, false]
    ])
    // The ok run's context hash still matches the context assembled right now.
    expect(body.inputUnchanged).toBe(true)
  })

  it('cancel kills a running child and the late result never overwrites the cancel', async () => {
    const child = mockHangingChild()
    const runId = await postRun('model-cancel')
    await waitForStatus(runId, ['running'])

    const res = await app.request(`/api/advisor/runs/${runId}/cancel`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(child.kill).toHaveBeenCalled()

    child.resolve(OK_RESULT) // the killed child still resolved late
    await new Promise((r) => setTimeout(r, 20))
    expect((await getRun(runId)).status).toBe('cancelled')
  })

  it('a run cancelled while queued is never spawned', async () => {
    const first = mockHangingChild()
    const second = mockHangingChild()
    const runA = await postRun('model-q')
    const runB = await postRun('model-q')
    await waitForStatus(runA, ['running'])
    await waitForStatus(runB, ['running'])

    const runC = await postRun('model-q') // both slots busy → stays queued
    expect((await getRun(runC)).status).toBe('queued')
    expect((await app.request(`/api/advisor/runs/${runC}/cancel`, { method: 'POST' })).status).toBe(200)

    first.resolve(OK_RESULT)
    second.resolve(OK_RESULT)
    await waitForStatus(runA, ['ok'])
    await waitForStatus(runB, ['ok'])
    await new Promise((r) => setTimeout(r, 20))
    expect((await getRun(runC)).status).toBe('cancelled')
    expect(spawnAdvisorMock).toHaveBeenCalledTimes(2)
  })

  it('rejects cancel on a finished run with 409 and unknown runs with 404', async () => {
    mockResult(OK_RESULT)
    const runId = await postRun('model-done')
    await waitForStatus(runId, ['ok'])
    expect((await app.request(`/api/advisor/runs/${runId}/cancel`, { method: 'POST' })).status).toBe(409)
    expect((await app.request('/api/advisor/runs/nope')).status).toBe(404)
    expect((await app.request('/api/advisor/runs/nope/cancel', { method: 'POST' })).status).toBe(404)
  })

  it('validates the run request', async () => {
    const post = (body: unknown) =>
      app.request('/api/advisor/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    expect((await post({ objectType: 'starship', objectKey: 'x' })).status).toBe(400)
    expect((await post({ objectType: 'model', objectKey: '' })).status).toBe(400)
    expect((await post({ objectType: 'model', objectKey: 'x', model: 'gpt' })).status).toBe(400)
    expect((await app.request('/api/advisor/runs?objectType=nope&objectKey=x')).status).toBe(400)
  })
})
