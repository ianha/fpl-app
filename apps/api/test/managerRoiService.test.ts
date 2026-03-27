import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { ManagerRoiService } from "../src/services/managerRoiService.js";
import { now, seedPublicData } from "./myTeamFixtures.js";

let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fpl-manager-roi-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function seedManagerRoiScenario(db: ReturnType<typeof createDatabase>) {
  seedPublicData(db);

  db.prepare(
    `INSERT INTO teams (id, code, name, short_name, strength, updated_at) VALUES
      (3, 43, 'Chelsea', 'CHE', 4, ?),
      (4, 6, 'Spurs', 'TOT', 4, ?)`,
  ).run(now(), now());

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

  const playerIds = [20, 21, 22, 23, 24, 25];
  for (const playerId of playerIds) {
    insertPlayer.run(
      playerId, 10000 + playerId, `Player${playerId}`, "Test", `Player${playerId}`,
      playerId % 2 === 0 ? 1 : 2, playerId % 2 === 0 ? 3 : 4, 70, 100,
      5.0, 10.0, 4.0, 5, 3, 1, 1800,
      10, 200, 100, 100, 100, 100, 5.0, 2.0,
      7.0, 0, 0, 0, 5, 0.1, 20,
      1, 1, 1, `${playerId}.jpg`, 3, "a", now(),
    );
  }

  db.prepare(
    `INSERT INTO my_team_accounts (
      id, email, encrypted_credentials, manager_id, entry_id, player_first_name, player_last_name, team_name,
      auth_status, last_authenticated_at, updated_at
    ) VALUES
      (1, 'manager1@fpl.local', 'encrypted', 77, 321, 'Manager', 'One', 'M1 FC', 'authenticated', ?, ?),
      (2, 'manager2@fpl.local', 'encrypted', 88, 654, 'Manager', 'Two', 'M2 FC', 'authenticated', ?, ?)`,
  ).run(now(), now(), now(), now());

  const insertGw = db.prepare(
    `INSERT INTO my_team_gameweeks (
      account_id, gameweek_id, points, total_points, overall_rank, rank, bank, value, event_transfers,
      event_transfers_cost, points_on_bench, active_chip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const accountId of [1, 2]) {
    for (let gw = 10; gw <= 25; gw += 1) {
      insertGw.run(accountId, gw, 50, 500 + gw, 100000, 100000, 10, 1000, 1, gw % 2 === 0 ? 4 : 0, 5, null);
    }
  }

  const insertTransfer = db.prepare(
    `INSERT INTO my_team_transfers (
      account_id, transfer_id, gameweek_id, transferred_at, player_in_id, player_out_id, player_in_cost, player_out_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (let index = 0; index < 3; index += 1) {
    insertTransfer.run(
      1,
      `m1-${index + 1}`,
      10 + index,
      `2026-03-${10 + index}T15:00:00.000Z`,
      20,
      21,
      70,
      70,
    );
  }

  for (let index = 0; index < 16; index += 1) {
    insertTransfer.run(
      2,
      `m2-${index + 1}`,
      10 + index,
      `2026-04-${String((index % 20) + 1).padStart(2, "0")}T15:00:00.000Z`,
      index % 2 === 0 ? 22 : 24,
      index % 2 === 0 ? 23 : 25,
      70,
      70,
    );
  }

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

  for (let round = 11; round <= 28; round += 1) {
    insertHistory.run(
      20, round, 8, 90, 1, 0, 0, 2, 24, 10,
      12, 13, 4, 0.5, 0.2, 0.7, 0, 0, 0, 0.5, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 70, 1, `2026-04-${String((round % 20) + 1).padStart(2, "0")}T15:00:00.000Z`, now(),
    );
    insertHistory.run(
      21, round, 2, 90, 0, 0, 0, 0, 8, 4,
      5, 4, 2, 0.1, 0.05, 0.15, 0, 0, 0, 1.2, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 2, 1, 1, 2, 70, 0, `2026-04-${String((round % 20) + 1).padStart(2, "0")}T18:00:00.000Z`, now(),
    );
    insertHistory.run(
      22, round, 10, 90, 1, 1, 0, 2, 28, 12,
      15, 16, 5, 0.7, 0.3, 1.0, 0, 0, 0, 0.4, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 70, 1, `2026-05-${String((round % 20) + 1).padStart(2, "0")}T15:00:00.000Z`, now(),
    );
    insertHistory.run(
      23, round, 1, 90, 0, 0, 0, 0, 6, 2,
      3, 2, 1, 0.05, 0.03, 0.08, 0, 0, 0, 1.4, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 2, 1, 1, 2, 70, 0, `2026-05-${String((round % 20) + 1).padStart(2, "0")}T18:00:00.000Z`, now(),
    );
    insertHistory.run(
      24, round, 7, 90, 1, 0, 0, 1, 20, 8,
      10, 10, 3, 0.4, 0.1, 0.5, 0, 0, 0, 0.5, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 70, 1, `2026-06-${String((round % 20) + 1).padStart(2, "0")}T15:00:00.000Z`, now(),
    );
    insertHistory.run(
      25, round, 6, 90, 0, 1, 0, 1, 18, 7,
      9, 8, 3, 0.3, 0.2, 0.5, 0, 0, 0, 0.8, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 70, 0, `2026-06-${String((round % 20) + 1).padStart(2, "0")}T18:00:00.000Z`, now(),
    );
  }
}

describe("ManagerRoiService", () => {
  it("shrinks sparse manager histories toward the global baseline", () => {
    const db = createDatabase(path.join(tempDir, "manager-roi-sparse.sqlite"));
    seedManagerRoiScenario(db);

    const service = new ManagerRoiService(db);
    const profile = service.evaluateManagerRoi({
      accountId: 1,
      sampleThreshold: 15,
      futureWindow: 3,
    });

    expect(profile.sampleSize).toBe(3);
    expect(profile.usedGlobalBaseline).toBe(true);
    expect(profile.posteriorWeight).toBeCloseTo(0.2);
    expect(profile.averageNetPointsGain).not.toBe(
      profile.globalBaseline.averageNetPointsGain,
    );
    expect(profile.averageNetPointsGain).toBeLessThan(18);
  });

  it("uses fully personalized outputs once the manager clears the threshold", () => {
    const db = createDatabase(path.join(tempDir, "manager-roi-threshold.sqlite"));
    seedManagerRoiScenario(db);

    const service = new ManagerRoiService(db);
    const profile = service.evaluateManagerRoi({
      accountId: 2,
      sampleThreshold: 15,
      futureWindow: 3,
    });

    expect(profile.sampleSize).toBeGreaterThanOrEqual(15);
    expect(profile.usedGlobalBaseline).toBe(false);
    expect(profile.posteriorWeight).toBe(1);
    expect(profile.recommendedRiskPosture).toBe("upside");
  });

  it("subtracts hit costs when computing hit ROI", () => {
    const db = createDatabase(path.join(tempDir, "manager-roi-hit-cost.sqlite"));
    seedManagerRoiScenario(db);

    const service = new ManagerRoiService(db);
    const profile = service.evaluateManagerRoi({
      accountId: 1,
      sampleThreshold: 15,
      futureWindow: 3,
    });

    expect(profile.outcomes[0]?.wasHit).toBe(true);
    expect(profile.outcomes[0]?.eventTransfersCost).toBe(4);
    expect(profile.outcomes[0]?.netPointsGain).toBe(14);
    expect(profile.hitRoi).toBeGreaterThan(0);
  });
});
