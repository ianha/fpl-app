import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { createApp } from "../src/app.js";
import { now, seedPublicData } from "./myTeamFixtures.js";

let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fpl-mcp-router-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function parseSseJsonPayload(responseText: string) {
  const dataLine = responseText
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error(`Unable to parse SSE response: ${responseText}`);
  }

  return JSON.parse(dataLine.slice("data: ".length)) as {
    result?: {
      content?: Array<{ type: string; text: string }>;
    };
    error?: { code: number; message: string };
    jsonrpc: string;
    id: number | null;
  };
}

function seedMcpTrainingMatrixScenario(db: ReturnType<typeof createDatabase>) {
  seedPublicData(db);

  db.prepare(
    `INSERT INTO teams (id, code, name, short_name, strength, updated_at) VALUES
      (3, 43, 'Chelsea', 'CHE', 4, ?),
      (4, 6, 'Spurs', 'TOT', 3, ?)`,
  ).run(now(), now());

  const insertHistory = db.prepare(
    `INSERT INTO player_history (
      player_id, round, total_points, minutes, goals_scored, assists, clean_sheets, bonus, bps, creativity,
      influence, threat, ict_index, expected_goals, expected_assists, expected_goal_involvements,
      expected_goal_performance, expected_assist_performance, expected_goal_involvement_performance,
      expected_goals_conceded, tackles, recoveries, clearances_blocks_interceptions, defensive_contribution,
      saves, yellow_cards, red_cards, own_goals, penalties_saved, penalties_missed, goals_conceded, starts,
      opponent_team, team_id, value, was_home, kickoff_time, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insertHistory.run(
    10, 5, 6, 80, 0, 1, 0, 1, 20, 11,
    15, 12, 4, 0.20, 0.10, 0.30, 0, 0, 0, 1.00, 1, 3, 1, 2,
    0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 104, 1, "2026-03-10T15:00:00.000Z", now(),
  );
  insertHistory.run(
    10, 6, 8, 90, 1, 0, 1, 2, 30, 14,
    18, 17, 5, 0.60, 0.20, 0.80, 0, 0, 0, 0.80, 1, 4, 1, 2,
    0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 105, 0, "2026-03-17T15:00:00.000Z", now(),
  );
  insertHistory.run(
    10, 7, 10, 90, 1, 1, 0, 3, 35, 20,
    22, 23, 7, 0.90, 0.35, 1.25, 0, 0, 0, 0.70, 1, 3, 1, 2,
    0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 106, 1, "2026-03-24T15:00:00.000Z", now(),
  );
}

function seedMcpManagerRoiScenario(db: ReturnType<typeof createDatabase>) {
  seedPublicData(db);

  const insertPlayer = db.prepare(
    `INSERT INTO players (
      id, code, web_name, first_name, second_name, team_id, position_id, now_cost, total_points,
      form, selected_by_percent, points_per_game, goals_scored, assists, clean_sheets, minutes,
      bonus, bps, creativity, influence, threat, ict_index, expected_goals, expected_assists,
      expected_goal_involvements, expected_goal_performance, expected_assist_performance,
      expected_goal_involvement_performance, expected_goals_conceded, clean_sheets_per_90, starts,
      tackles, recoveries, defensive_contribution, photo, team_code, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const playerId of [20, 21]) {
    insertPlayer.run(
      playerId, 10000 + playerId, `Player${playerId}`, "Test", `Player${playerId}`,
      1, 3, 70, 100, 5.0, 10.0, 4.0, 5, 3, 1, 1800,
      10, 200, 100, 100, 100, 100, 5.0, 2.0, 7.0, 0, 0, 0, 5, 0.1, 20,
      1, 1, 1, `${playerId}.jpg`, 3, "a", now(),
    );
  }

  db.prepare(
    `INSERT INTO my_team_accounts (
      id, email, encrypted_credentials, manager_id, entry_id, player_first_name, player_last_name, team_name,
      auth_status, last_authenticated_at, updated_at
    ) VALUES (1, 'manager@fpl.local', 'encrypted', 77, 321, 'Manager', 'One', 'M1 FC', 'authenticated', ?, ?)`,
  ).run(now(), now());

  db.prepare(
    `INSERT INTO my_team_gameweeks (
      account_id, gameweek_id, points, total_points, overall_rank, rank, bank, value, event_transfers,
      event_transfers_cost, points_on_bench, active_chip
    ) VALUES
      (1, 10, 50, 500, 100000, 100000, 10, 1000, 1, 4, 5, NULL),
      (1, 11, 50, 550, 100000, 100000, 10, 1000, 1, 0, 5, NULL),
      (1, 12, 50, 600, 100000, 100000, 10, 1000, 1, 4, 5, NULL)`,
  ).run();

  db.prepare(
    `INSERT INTO my_team_transfers (
      account_id, transfer_id, gameweek_id, transferred_at, player_in_id, player_out_id, player_in_cost, player_out_cost
    ) VALUES
      (1, 't1', 10, '2026-04-01T15:00:00.000Z', 20, 21, 70, 70),
      (1, 't2', 11, '2026-04-08T15:00:00.000Z', 20, 21, 70, 70)`,
  ).run();

  const insertHistory = db.prepare(
    `INSERT INTO player_history (
      player_id, round, total_points, minutes, goals_scored, assists, clean_sheets, bonus, bps, creativity,
      influence, threat, ict_index, expected_goals, expected_assists, expected_goal_involvements,
      expected_goal_performance, expected_assist_performance, expected_goal_involvement_performance,
      expected_goals_conceded, tackles, recoveries, clearances_blocks_interceptions, defensive_contribution,
      saves, yellow_cards, red_cards, own_goals, penalties_saved, penalties_missed, goals_conceded, starts,
      opponent_team, team_id, value, was_home, kickoff_time, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const round of [11, 12, 13]) {
    insertHistory.run(
      20, round, 8, 90, 1, 0, 0, 2, 24, 10,
      12, 13, 4, 0.5, 0.2, 0.7, 0, 0, 0, 0.5, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 70, 1, `2026-04-${String(round).padStart(2, "0")}T15:00:00.000Z`, now(),
    );
    insertHistory.run(
      21, round, 2, 90, 0, 0, 0, 0, 8, 4,
      5, 4, 2, 0.1, 0.05, 0.15, 0, 0, 0, 1.2, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 2, 1, 1, 2, 70, 0, `2026-04-${String(round).padStart(2, "0")}T18:00:00.000Z`, now(),
    );
  }
}

describe("MCP router", () => {
  it("returns training-matrix rows through the MCP tool surface", async () => {
    const db = createDatabase(path.join(tempDir, "training-matrix.sqlite"));
    seedMcpTrainingMatrixScenario(db);
    const app = createApp(db);

    const response = await request(app)
      .post("/mcp")
      .set("accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_training_matrix",
          arguments: {
            target_gameweek: 7,
            lookback_window: 2,
          },
        },
      })
      .expect(200);

    const payload = parseSseJsonPayload(response.text);
    const rows = JSON.parse(payload.result?.content?.[0]?.text ?? "[]") as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.playerId).toBe(10);
    expect(rows[0]?.matchesInLookback).toBe(2);
  });

  it("returns Bayesian-smoothed manager ROI through the MCP tool surface", async () => {
    const db = createDatabase(path.join(tempDir, "manager-roi.sqlite"));
    seedMcpManagerRoiScenario(db);
    const app = createApp(db);

    const response = await request(app)
      .post("/mcp")
      .set("accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "evaluate_manager_roi",
          arguments: {
            account_id: 1,
            future_window: 2,
            sample_threshold: 15,
          },
        },
      })
      .expect(200);

    const payload = parseSseJsonPayload(response.text);
    const profile = JSON.parse(payload.result?.content?.[0]?.text ?? "{}") as Record<string, unknown>;

    expect(profile.accountId).toBe(1);
    expect(profile.usedGlobalBaseline).toBe(true);
    expect(profile.sampleSize).toBe(2);
  });

  it("stores validated projection weights through the MCP tool surface", async () => {
    const db = createDatabase(path.join(tempDir, "projection-weights.sqlite"));
    const app = createApp(db);

    const response = await request(app)
      .post("/mcp")
      .set("accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "update_projection_weights",
          arguments: {
            model_name: "transfer_event_points_v2",
            version_tag: "2026-gw30",
            coefficients: {
              rolling_xg: 1.25,
              rolling_xa: 0.85,
            },
            metadata: {
              trainer: "offline-xgboost",
            },
            activate: true,
          },
        },
      })
      .expect(200);

    const payload = parseSseJsonPayload(response.text);
    const stored = JSON.parse(payload.result?.content?.[0]?.text ?? "{}") as {
      registry: { modelName: string };
      version: { isActive: boolean; coefficients: Record<string, unknown> };
    };

    expect(stored.registry.modelName).toBe("transfer_event_points_v2");
    expect(stored.version.isActive).toBe(true);
    expect(stored.version.coefficients.rolling_xg).toBe(1.25);
  });
});
