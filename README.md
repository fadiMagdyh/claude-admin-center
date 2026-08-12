# Claude Admin Center

A local, read-only dashboard over your Claude Code data (`claude-config`): projects, sessions, usage, models, skills, plugins, MCP servers, and an activity feed — with per-object "Ask Claude" advice.

## Layout

npm-workspaces monorepo:

- `client/` — Vite + React + TypeScript UI (dev server on port 5173, proxies `/api` to the server)
- `server/` — Node + Hono + TypeScript API (port 3000)
- `shared/` — types shared between client and server

## Prerequisites

- Node.js 24+

## Run

```sh
npm install
npm run dev
```

This starts the API server on http://localhost:3000 and the UI on http://localhost:5173 (open the UI).

## Other commands

```sh
npm run lint    # lint all workspaces
npm test        # run all workspace tests
npm run build   # type-check and build all workspaces
```
