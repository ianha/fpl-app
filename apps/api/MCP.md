# FPL Database MCP Server

The FPL API exposes its SQLite database as a **Model Context Protocol (MCP)** server, enabling MCP-compatible LLM clients to query the dataset securely.

## Server Details

- **Protocol**: [Model Context Protocol](https://modelcontextprotocol.io/) (`2025-03-26`)
- **Transport**: **Streamable HTTP** (stateless)
- **Endpoint**: `POST http://localhost:4000/mcp`
- **Auth**: None (trusted local network)

The MCP server runs automatically alongside the REST API (`npm run dev:api`).

## Tools & Resources

### Tool: `query`
Execute read-only SQL queries (`SELECT` or `WITH`) against the database. Mutations (`INSERT`, `UPDATE`, `DELETE`, etc.) are blocked.
- **Parameters**: `sql` (string, required) - Valid SQL query.
- **Returns**: A JSON array of result rows or `{ "error": "<message>" }`.

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

## Connecting Clients

### Claude Desktop
Add to your `claude_desktop_config.json`:
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

### MCP Inspector
Test the server interactively:
```bash
npx @modelcontextprotocol/inspector http://localhost:4000/mcp
```
