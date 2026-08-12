import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export type LiveSession = { sessionId: string; cwd: string }

/** The live-session registry: sessions/*.json, one file per running CLI process. */
export function readLiveSessions(configRoot: string): LiveSession[] {
  const sessionsDir = join(configRoot, 'sessions')
  let files: string[]
  try {
    files = readdirSync(sessionsDir)
  } catch {
    return []
  }
  const sessions: LiveSession[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const record = JSON.parse(readFileSync(join(sessionsDir, file), 'utf8')) as {
        sessionId?: string
        cwd?: string
        status?: string
      }
      // Observed status vocabulary: "busy" / "idle" — both mean the process is up.
      if (typeof record.sessionId === 'string' && typeof record.cwd === 'string' && typeof record.status === 'string') {
        sessions.push({ sessionId: record.sessionId, cwd: record.cwd })
      }
    } catch {
      // skip malformed registry files
    }
  }
  return sessions
}
