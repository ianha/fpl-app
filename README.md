# FPLytics

A public mirror of the [fantasy.premierleague.com](https://fantasy.premierleague.com) site to be run locally. It allows for AI integration with an LLM (chat), as well as data science and querying ability, to allow for deeper insights not available on the official site.

## Features

- **Sync Pipeline**: Pulls all public FPL data into a local SQLite database idempotently.
- **Express API**: Read-only JSON endpoints serving player, fixture, gameweek, and team data.
- **React Frontend**: Dark-themed, glassmorphism UI for browsing players, fixtures, and My Team.
- **My Team Sync**: Link your real FPL manager account for synced squad and transfer history.
- **Advanced Metrics**: Includes xG, xA, xGI, xGP, xAP, xGIP, ICT index, tackles, and recoveries.
- **AI Chat + Local Tools**: Cloud LLM chat can query the local database through hardened read-only tools; MCP is available for local/authorized external tool clients.
- **Automated Tests**: Comprehensive coverage for sync logic, API endpoints, and React components.

## Tech Stack

- **Backend**: Node.js 20, Express 5, better-sqlite3 (SQLite)
- **Frontend**: React 19, Vite 7, Tailwind CSS v4, shadcn/ui, React Router v7, framer-motion, Recharts
- **Tooling**: TypeScript 5, tsx, Vitest, npm workspaces, concurrently

## Quick Start

### 1. Requirements
- Node.js 20+
- npm 10+

### 2. Setup
```bash
git clone <repo-url> fplytics
cd fplytics
npm install
cp .env.example .env
```

### 3. Seed the Database
Run the sync pipeline to fetch data from the official FPL API. The first run takes ~40 minutes.
```bash
npm run sync
```

### 4. Run the Application
Start both the API (port 4000) and frontend (port 5173).
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

## Commands

Run these from the repository root:

| Command | Description |
|---|---|
| `npm run dev` | Start API and frontend together |
| `npm run dev:api` | Start only the API |
| `npm run dev:web` | Start only the frontend |
| `npm run build` | Build both apps for production |
| `npm run typecheck` | Type-check all workspaces |
| `npm run lint` | Type-check all workspaces with unused locals/parameters enabled |
| `npm run test` | Run all tests |
| `npm run test:watch` | Run all tests in watch mode |

### Database Sync Commands

When running sync commands through `npm`, use `--` to pass options directly to the underlying script. You can safely combine these options (for example, targeting a gameweek while using force).

**`npm run sync`** (Public FPL Data)
- `npm run sync`: Standard full sync. Uses hash snapshots to skip fetching unchanged players.
- `npm run sync -- --gameweek 29`: Only fetches players involved in gameweek 29 (much faster).
- `npm run sync -- --force`: Bypasses the snapshot mechanism to forcefully re-fetch all data and download all assets.
- `npm run sync -- --gameweek 29 --force`: Bypasses the snapshot check just for the players in gameweek 29.

**`npm run sync:my-team`** (Personal FPL Accounts)
- `npm run sync:my-team`: Refreshes all currently linked FPL manager accounts.
- `npm run sync:my-team -- --gameweek 29`: Refresh squad picks for just that gameweek.
- `npm run sync:my-team -- --account 3`: Target one specific linked FPL account by its local database ID.
- `npm run sync:my-team -- --email you@example.com`: Target one specific linked FPL account by its login email.
- `npm run sync:my-team -- --force`: Force-refresh the active snapshot for all accounts.

*Example Combination:* `npm run sync:my-team -- --email test@test.com --gameweek 29 --force`

### ML Model Commands

| Command | Description |
|---|---|
| `npm run retrain:model` | Train the model on pending gameweeks and clear them from the queue |
| `npm run retrain:model -- --all` | Retrain on all finished gameweeks |
| `npm run retrain:model -- --gameweek 29` | Retrain on a specific gameweek |
| `npm run ack:pending-ml-evaluation -w @fpl/api -- --all` | Clear the entire pending ML evaluation queue |
| `npm run ack:pending-ml-evaluation -w @fpl/api -- --gameweek 29` | Clear a specific gameweek from the queue |

## Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `PORT` (default 4000)
- `DB_PATH` (default `./apps/api/data/fpl.sqlite`)
- `FPL_MIN_REQUEST_INTERVAL_MS` (default 3000)
- `PUBLIC_URL` (public API origin for share/OG URLs)
- `WEB_URL` (public web origin for OAuth redirects)
- `VITE_API_BASE_URL` (default unset, uses origin + `/api`)
- `FPL_LOCAL_TOOLS` (`auto`, `off`, or `on`; controls `/mcp` exposure)
- `FPL_TOOL_AUTH_TOKEN` (required when `FPL_LOCAL_TOOLS=on` and accessing `/mcp` from a non-local host)

For My Team account linking, you must set `FPL_AUTH_SECRET` to a random string.

When hosting the local app through a Cloudflare tunnel, the normal AI Chat route (`/api/chat/stream`) still works through the web app/API. The local-only gate applies to the standalone HTTP MCP endpoint (`/mcp`), not the in-app chat tool runner.

## Project Structure

- `apps/api/`: Express API, sync pipeline, SQLite database (`data/fpl.sqlite`)
- `apps/web/`: React frontend (Vite, Tailwind, custom UI)
- `packages/contracts/`: Shared TypeScript types for API and frontend

For more details, see:
- [Backend docs](apps/api/README.md)
- [Frontend docs](apps/web/README.md)
