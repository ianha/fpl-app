# FPL Database MCP Server

The FPL API exposes its SQLite database as a **Model Context Protocol (MCP)** server, enabling MCP-compatible LLM clients to query the dataset securely.

## Server Details

- **Protocol**: [Model Context Protocol](https://modelcontextprotocol.io/) (`2025-03-26`)
- **Transport**: **Streamable HTTP** (stateless)
- **Endpoint**: `POST http://localhost:4000/mcp`
- **Access**: Local/private hosts by default; non-local hosts require explicit opt-in plus a token.

The MCP server runs automatically alongside the REST API (`npm run dev:api`).

## Access Policy

The MCP endpoint is guarded separately from the normal REST API and in-app AI Chat.

| Variable | Default | Behavior |
|---|---|---|
| `FPL_LOCAL_TOOLS` | `auto` | Allow `/mcp` from localhost, loopback, `.local`, `.internal`, and private-network hosts only |
| `FPL_LOCAL_TOOLS=off` | | Disable `/mcp` entirely |
| `FPL_LOCAL_TOOLS=on` | | Allow non-local `/mcp` requests only with `FPL_TOOL_AUTH_TOKEN` |
| `FPL_TOOL_AUTH_TOKEN` | unset | Required for non-local `/mcp` requests when local tools are `on` |

For non-local access, send either:

```http
Authorization: Bearer <FPL_TOOL_AUTH_TOKEN>
```

or:

```http
x-fpl-tool-token: <FPL_TOOL_AUTH_TOKEN>
```

This means a Cloudflare tunnel can safely host the app and API while keeping MCP local-only by default. The AI Chat feature does not call the HTTP `/mcp` route; it uses the API's internal read-only tools through `/api/chat/stream`, so the local-only MCP gate does not break normal chat usage.

## Tools & Resources

### Tool: `query`
Execute read-only SQL queries (`SELECT` or `WITH`) against the database. Mutations (`INSERT`, `UPDATE`, `DELETE`, etc.) are blocked.
- **Parameters**: `sql` (string, required) - Valid SQL query.
- **Returns**: A JSON array of result rows or `{ "error": "<message>" }`.
- **Safety**: SQLite `query_only` is enabled while executing the statement. Sensitive credential columns are hidden from schema output and blocked from query text/results.

### Tool: `get_training_matrix`
Returns a supervised learning dataset mapping historical rolling player performance to actual target-match points.
- **Parameters**:
  - `target_gameweek` (integer, required) - The target gameweek to build supervised rows for.
  - `lookback_window` (integer, optional, default `5`) - Number of prior gameweeks to average into the feature window.
- **Guarantees**:
  - Strict no-lookahead enforcement: only `player_history` rows with `round < target_gameweek` are used as features.
  - Double gameweeks remain match-level because grouping uses target match identity (`player_id`, `round`, `opponent_team`, `kickoff_time`).
- **Returns**: A JSON array of trainer-ready rows including rolling event features, contextual fixture inputs, and actual points.

### Tool: `evaluate_manager_roi`
Returns a Bayesian-smoothed manager transfer profile derived from `my_team_transfers`, `my_team_gameweeks`, and future player outcomes.
- **Parameters**:
  - `account_id` (integer, required) - The `my_team_accounts.id` to profile.
  - `from_gameweek` (integer, optional) - Optional lower gameweek bound.
  - `to_gameweek` (integer, optional) - Optional upper gameweek bound.
  - `future_window` (integer, optional, default `3`) - Number of future gameweeks to score transfer outcomes across.
  - `sample_threshold` (integer, optional, default `15`) - Minimum history size before using fully personalized values.
- **Returns**: A JSON object containing per-transfer outcomes, hit ROI, success rate, a Bayesian-smoothed risk profile, and a recommended posture (`safe`, `balanced`, `upside`).

### Tool: `update_projection_weights`
Writes a validated coefficient payload to the explicit ML model registry/version tables.
- **Parameters**:
  - `model_name` (string, required) - Logical model identifier.
  - `target_metric` (string, optional, default `expected_raw_points`) - Metric the model predicts.
  - `description` (string, optional) - Human-readable model description.
  - `version_tag` (string, optional) - Version label or training-run tag.
  - `coefficients` (object, required) - JSON coefficient payload.
  - `metadata` (object, optional) - Additional training metadata.
  - `gameweek_scope` (string, optional) - Optional scope label for the model version.
  - `activate` (boolean, optional, default `true`) - Whether to make the new version active immediately.
- **Returns**: The registry record plus the stored version record.

### Resource: `schema://fpl-database`
Returns the schema definition for all tables, columns, and types in the FPL SQLite database. LLMs should read this before formulating queries.

## SQLite Database Schema

The MCP server provides access to several key tables containing the FPL dataset:

### `players`
Season aggregate stats, prices, and ownership.
- **Key Columns**: `id` (PK, FPL element ID), `web_name`, `team_id` (FK -> teams), `position_id` (FK -> positions), `now_cost` (price x 10), `total_points`, `expected_goals` (xG), `expected_assists` (xA), `expected_goal_involvements` (xGI), `expected_goal_performance` (xGP), `expected_assist_performance` (xAP), `expected_goal_involvement_performance` (xGIP).

### `player_history`
Granular per-gameweek performance metrics for each player.
- **Key Columns**: `player_id` (FK -> players), `round` (Gameweek number), `total_points`, `minutes`, `goals_scored`, `assists`, `expected_goals`, `expected_assists`, `opponent_team` (FK -> teams), `was_home`, `kickoff_time`.
- *Note:* The primary key is composite `(player_id, round, opponent_team, kickoff_time)` to accommodate Double Gameweeks where a player plays twice in one round.

### `fixtures`
Match schedule and scores. Both finished and upcoming matches.
- **Key Columns**: `id` (PK), `event_id` (Gameweek ID), `kickoff_time`, `team_h` (Home team FK -> teams), `team_a` (Away team FK -> teams), `team_h_score`, `team_a_score`, `finished`, `started`.

### `teams`
Premier League clubs.
- **Key Columns**: `id` (PK), `name` (e.g. "Arsenal"), `short_name` (e.g. "ARS"), `strength`.

### Reference & Internal Tables
- **`gameweeks`**: Gameweek metadata, deadlines, and current/finished flags.
- **`positions`**: Player positions (1=GKP, 2=DEF, 3=MID, 4=FWD).
- **`player_future_fixtures`**: Upcoming matches assigned to specific `player_id`s.

### My Team (Personal Account Data)
- **`my_team_accounts`**: Linked FPL accounts and authentication status.
- **`my_team_gameweeks`**: GW points, overall rank, and available bank balance per account.
- **`my_team_picks`**: The actual squad choices (slots 1-15) and point multipliers for a GW.
- **`my_team_transfers`**: Trade history (player in/out) per account.
- **`my_team_seasons`**: Historical past-season summaries for linked accounts.

### Internal Sync Tables
- `player_sync_status`, `gameweek_player_sync_status`, `sync_state`, `sync_runs`.

### ML Model Tables
- **`ml_model_registry`**: Tracks logical model identities such as `transfer_event_points_v2`.
- **`ml_model_versions`**: Stores versioned coefficient payloads, activation state, and scope for runtime use and rollback.

## Connecting Clients

### Claude Desktop
For local use, add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "fpl-database": {
      "url": "http://localhost:4000/mcp",
      "transport": "http"
    }
  }
}
```

For tunneled/non-local use, set `FPL_LOCAL_TOOLS=on`, set a strong `FPL_TOOL_AUTH_TOKEN`, and configure your client to send one of the token headers shown above.

### MCP Inspector
Test the server interactively:
```bash
npx @modelcontextprotocol/inspector http://localhost:4000/mcp
```
