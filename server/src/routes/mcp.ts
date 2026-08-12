import { Hono } from 'hono'
import { resolveConfigRoot } from '../readers/configRoot.js'
import { listMcpServers } from '../readers/mcp.js'

export const mcp = new Hono()

mcp.get('/', (c) => {
  return c.json(listMcpServers(resolveConfigRoot()))
})
