import { homedir } from 'node:os'
import { join } from 'node:path'

/** The directory all Claude Code state is read from. */
export function resolveConfigRoot(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}
