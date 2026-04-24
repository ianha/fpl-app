# @fpl/api — Backend API and Sync Service

The backend performs two independent tasks:
1. **Sync**: A CLI process that pulls public Fantasy Premier League data into a local SQLite database (`data/fpl.sqlite`).
2. **Serve**: An Express HTTP API providing read-only JSON endpoints queried by the frontend.

## Architecture

- `fplApiClient.ts`: Fetches upstream data from the FPL API.
- `syncService.ts` / `assetSyncService.ts`: Orchestrates database upserts and image downloads into `/assets`.
- `database.ts`: Handles SQLite schema setup and data migrations using `better-sqlite3`.
- `queryService.ts`: Read-only data queries with filtering and sorting.
- `chat/`: AI chat provider configuration and hardened read-only database tools.
- `mcp/createMcpRouter.ts`: Local/authorized MCP tool endpoint for external clients.
- `createApiRouter.ts` / `app.ts`: HTTP route handlers.

## Commands

Run from repo root or with `-w @fpl/api`.

| Command | Description |
|---|---|
| `npm run dev:api` | Start API server (Hot reload) |
| `npm run build -w @fpl/api` | Type-check and compile the API |
| `npm run typecheck -w @fpl/api` | Type-check without emitting build output |
| `npm run typecheck:unused -w @fpl/api` | Type-check with unused locals/parameters enabled |
| `npm run test -w @fpl/api` | Run API tests using temporary SQLite databases |

### Database Sync Commands

You can append flags directly behind the `--` separator to modify the behavior of sync runs.

**`npm run sync`** (Fetches public player/fixture data)
- `--gameweek <id>`: Target a single gameweek (e.g., `npm run sync -- --gameweek 29`).
- `--player <id>`: Target a single player, optionally within one gameweek.
- `--force`: Bypass caching, downloading data and image assets even if hashes match.

**`npm run seed:pending-ml-evaluation`** (One-off backfill for already-finished gameweeks)
- No flags: Queue every currently finished gameweek that is not already pending.
- `--gameweek <id>`: Queue one specific finished gameweek.

**`npm run retrain:model`** (Fit ridge regression and activate new event weights)
- No flags: Train on pending ML evaluation queue, clear queue on success.
- `--gameweek <id>`: Train on a single specified gameweek.
- `--all`: Train on all finished gameweeks concatenated.

**`npm run ack:pending-ml-evaluation`** (Clear processed queue items after successful training)
- `--gameweek <id>`: Remove one successfully processed gameweek from the pending queue.
- `--all`: Clear the full queue after a successful batch training/publish run.

**`npm run sync:my-team`** (Refreshes linked manager account queries)
- `--gameweek <id>`: Fetch picks/scores for a specific GW.
- `--account <id>`: Target an account via local database ID.
- `--email <str>`: Target an already linked account via login email.
- `--username <str>`: Provide the FPL login username/email for a relink during sync.
- `--password <str>`: Re-enter FPL credentials and relink before syncing.
- `--entry-id <id>`: Entry ID to store while relinking through sync.
- `--force`: Discard cached snapshots and pull fresh JSON.

*Combinations:* You can combine flags freely, e.g. `npm run sync:my-team -- --email test@test.com --gameweek 29 --force`.
If auth is expired or a relink is needed, the command now prompts for username, password, and entry ID interactively.
To relink and sync in one step without prompts, run `npm run sync:my-team -- --username test@test.com --password hunter2 --entry-id 1234567`.

## Database Schema Highlights

- **`players`**: Season aggregate stats, ownership, xG/xA, and locally calculated metrics (`xGP`, `xAP`, `xGIP`).
- **`player_history`**: Per-gameweek player performance. Key: `(player_id, round, opponent_team, kickoff_time)`.
- **`fixtures`**: Match schedules and scores.
- **`teams`**, **`positions`**, **`gameweeks`**: Reference meta data.
- **`sync_state`**, **`player_sync_status`**: Identifies completed tasks to allow interrupted syncs to resume intelligently tracking upstream data hashes.
- **`ml_model_registry`**, **`ml_model_versions`**: Explicit model version metadata and active raw-point coefficient payloads.

## Retry-Safe ML Evaluation Loop

Public-data sync now owns the durable handoff for retraining after finished gameweeks:

1. `npm run sync` (or `npm run sync -- --gameweek <id>`) updates `gameweeks`.
2. When a gameweek transitions from `is_finished = 0` to `is_finished = 1`, the sync layer appends that gameweek id to the `sync_state` key `pending_ml_evaluation`.
3. External training code can poll that state, fetch training data through MCP, publish a validated model version, and only then clear the completed gameweek from the queue with `npm run ack:pending-ml-evaluation -- --gameweek <id>` (or `--all` for a full successful batch).

Operational guarantees:

- Finished-gameweek work is queued exactly once per gameweek transition.
- Re-running sync does not duplicate already queued work.
- If sync or external training fails later, the pending ML evaluation state remains in place for the next retry.
- Learned model activation stays decoupled from sync, so upstream data refreshes are not blocked by trainer availability.

The CLI prints queued gameweeks after a successful run whenever pending ML evaluation work exists, making stalled retraining windows visible during normal operations.

If you need to backfill already-finished historical gameweeks after enabling this workflow, run `npm run seed:pending-ml-evaluation`. The command is idempotent and only appends gameweeks that are finished and not already present in the pending queue.

### Internal auto-trainer (recommended)

After sync, run the built-in ridge regression trainer to automatically fit and activate new event weights:

```bash
npm run sync
npm run retrain:model        # trains on pending queue, clears on success
```

The trainer fits 7 event weight coefficients (goal, assist, clean sheet, save, bonus, appearance, concede penalty) using ridge regression on the training matrix. Coefficients are clamped to [0.1, 5.0] and written to the ML model registry. Training is skipped if fewer than 100 rows are available.

### External training via MCP (advanced)

For experimentation with more sophisticated models, the MCP tools remain available:

1. Run `npm run sync`
2. Pull training data via `get_training_matrix` MCP tool
3. Train externally and publish via `update_projection_weights` MCP tool
4. Run `npm run ack:pending-ml-evaluation -- --gameweek <id>` for each successful publish

Both paths write to the same model registry — the most recently activated version wins.

### MCP exposure and hosted tunnels

The `/mcp` endpoint is intended for local or explicitly authorized tool clients:

- `FPL_LOCAL_TOOLS=auto` (default): allow localhost, loopback, and private-network hosts only.
- `FPL_LOCAL_TOOLS=off`: disable `/mcp` entirely.
- `FPL_LOCAL_TOOLS=on`: allow non-local hosts only when the request includes `Authorization: Bearer <FPL_TOOL_AUTH_TOKEN>` or `x-fpl-tool-token: <FPL_TOOL_AUTH_TOKEN>`.

This gate does not disable the in-app AI Chat. Chat requests go through `/api/chat/stream` and use the same hardened read-only SQL helpers internally, so a frontend/API hosted through a Cloudflare tunnel can still use AI Chat as long as the normal API routes are reachable.

The SQL helper additionally enables SQLite `query_only`, blocks mutating statements even when they begin with `WITH`, and hides sensitive credential columns from schema output and query results.

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
API tests use temporary SQLite databases, avoiding corruption of local files. `test/fixtures.ts` generates mock data shapes equivalent to upstream FPL responses.
