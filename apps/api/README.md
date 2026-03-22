# @fpl/api — Backend API and Sync Service

The backend performs two independent tasks:
1. **Sync**: A CLI process that pulls public Fantasy Premier League data into a local SQLite database (`data/fpl.sqlite`).
2. **Serve**: An Express HTTP API providing read-only JSON endpoints queried by the frontend.

## Architecture

- `fplApiClient.ts`: Fetches upstream data from the FPL API.
- `syncService.ts` / `assetSyncService.ts`: Orchestrates database upserts and image downloads into `/assets`.
- `database.ts`: Handles SQLite schema setup and data migrations using `better-sqlite3`.
- `queryService.ts`: Read-only data queries with filtering and sorting.
- `createApiRouter.ts` / `app.ts`: HTTP route handlers.

## Commands

Run from repo root or with `-w @fpl/api`.

| Command | Description |
|---|---|
| `npm run dev:api` | Start API server (Hot reload) |
| `npm run test` | Run API tests (uses in-memory `:memory:` SQLite) |

### Database Sync Commands

You can append flags directly behind the `--` separator to modify the behavior of sync runs.

**`npm run sync`** (Fetches public player/fixture data)
- `--gameweek <id>`: Target a single gameweek (e.g., `npm run sync -- --gameweek 29`).
- `--force`: Bypass caching, downloading data and image assets even if hashes match.

**`npm run sync:my-team`** (Refreshes linked manager account queries)
- `--gameweek <id>`: Fetch picks/scores for a specific GW.
- `--account <id>`: Target an account via local database ID.
- `--email <str>`: Target an account via login email.
- `--force`: Discard cached snapshots and pull fresh JSON.

*Combinations:* You can combine flags freely, e.g. `npm run sync:my-team -- --email test@test.com --gameweek 29 --force`.

## Database Schema Highlights

- **`players`**: Season aggregate stats, ownership, xG/xA, and locally calculated metrics (`xGP`, `xAP`, `xGIP`).
- **`player_history`**: Per-gameweek player performance. Key: `(player_id, round, opponent_team, kickoff_time)`.
- **`fixtures`**: Match schedules and scores.
- **`teams`**, **`positions`**, **`gameweeks`**: Reference meta data.
- **`sync_state`**, **`player_sync_status`**: Identifies completed tasks to allow interrupted syncs to resume intelligently tracking upstream data hashes.

## API Endpoints (`PORT=4000`)

All responses are JSON. Read-only.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (`{ "ok": true }`) |
| `GET` | `/api/overview` | Dashboard data: current gameweek, top players, fixtures, teams |
| `GET` | `/api/gameweeks` | All gameweeks with deadlines/scores |
| `GET` | `/api/fixtures` | All fixtures (`?event=GW` or `?team=ID`) |
| `GET` | `/api/players` | Search/filter players (`?search=`, `?team=`, `?position=`, `?sort=`) |
| `GET` | `/api/players/:id`| Full detail: history (last 8 GWs) + future fixtures |
| `GET` | `/assets/*` | Local player and team JPEG images |

## Rate Limiting
Sync limits upstream fetches to avoid IP blockages by FPL. Configured via `FPL_MIN_REQUEST_INTERVAL_MS` (default: 3000ms).

## Testing
API tests use an in-memory SQLite database, avoiding the corruption of local files.`test/fixtures.ts` generates mock data shapes equivalent to upstream FPL responses.
