import { spawn } from 'node:child_process'
import treeKill from 'tree-kill'
import type { AdvisorOutput, AdvisorRunModel } from 'shared'
import { ADVISOR_OUTPUT_SCHEMA, parseAdvisorOutput } from './schema.js'

const RUN_TIMEOUT_MS = 120_000
/** Error text persisted to the Ledger stays short — full output is never stored on failure. */
const MAX_ERROR_CHARS = 500

export type AdvisorSpawnResult =
  | { outcome: 'ok'; output: AdvisorOutput; costUsd: number | null; rawResult: string }
  | { outcome: 'error'; error: string }
  | { outcome: 'timeout' }

/** A running (or queued-to-run) spawned Claude: await the result, or kill the process tree. */
export type AdvisorChild = {
  promise: Promise<AdvisorSpawnResult>
  kill: () => void
}

/** The slice of the CLI's --output-format json result the advisor reads. */
type CliResult = {
  is_error?: boolean
  result?: string
  structured_output?: unknown
  total_cost_usd?: number
}

/**
 * Spawn one headless `claude -p` Advisor Run (verified invocation facts in
 * docs/research/headless-claude-invocation.md). The prompt goes via stdin to
 * dodge Windows quoting; the schema rides --json-schema so the CLI enforces
 * the output contract. Read-only by construction: only Read/Grep/Glob are
 * allowed and --permission-mode dontAsk hard-denies everything else without
 * prompting. --no-session-persistence keeps runs out of the dashboard's own
 * data. (--bare was verified incompatible with OAuth login — "Not logged in",
 * exit 1 — so it is dropped per the locked design's fallback.)
 */
export function spawnAdvisor(prompt: string, model: AdvisorRunModel, configRoot: string): AdvisorChild {
  const child = spawn(
    'claude',
    [
      '-p',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(ADVISOR_OUTPUT_SCHEMA),
      '--model', model,
      '--allowedTools', 'Read,Grep,Glob',
      '--permission-mode', 'dontAsk',
      '--no-session-persistence',
      '--add-dir', configRoot
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
  )

  const kill = () => {
    if (child.pid !== undefined && child.exitCode === null) treeKill(child.pid)
  }

  const promise = new Promise<AdvisorSpawnResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      kill()
    }, RUN_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', (error) => {
      clearTimeout(timeout)
      resolve({ outcome: 'error', error: `failed to spawn claude: ${error.message}`.slice(0, MAX_ERROR_CHARS) })
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (timedOut) return resolve({ outcome: 'timeout' })
      if (code !== 0) {
        return resolve({ outcome: 'error', error: `claude exited ${code}: ${stderr || stdout}`.slice(0, MAX_ERROR_CHARS) })
      }
      resolve(parseCliStdout(stdout))
    })

    child.stdin.on('error', () => {
      // The child died before reading the prompt — 'close' carries the real error.
    })
    child.stdin.end(prompt)
  })

  return { promise, kill }
}

/** Exit 0: parse the single JSON result line into ok / error (schema mismatch, API failure). */
function parseCliStdout(stdout: string): AdvisorSpawnResult {
  let cli: CliResult
  try {
    cli = JSON.parse(stdout) as CliResult
  } catch {
    return { outcome: 'error', error: `claude returned non-JSON output: ${stdout}`.slice(0, MAX_ERROR_CHARS) }
  }
  if (cli.is_error) {
    return { outcome: 'error', error: (cli.result ?? 'claude reported an error').slice(0, MAX_ERROR_CHARS) }
  }
  const output = parseAdvisorOutput(cli.structured_output)
  if (!output) {
    return { outcome: 'error', error: 'structured output missing or did not match the recommendations schema' }
  }
  return {
    outcome: 'ok',
    output,
    costUsd: typeof cli.total_cost_usd === 'number' ? cli.total_cost_usd : null,
    rawResult: JSON.stringify(cli.structured_output)
  }
}
