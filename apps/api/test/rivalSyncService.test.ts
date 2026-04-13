import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { RivalSyncService } from "../src/services/rivalSyncService.js";
import { seedPublicData, now } from "./myTeamFixtures.js";

const tempDirs: string[] = [];

function makeDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fpl-rival-sync-"));
  tempDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

function seedPhaseOneData(db: ReturnType<typeof createDatabase>) {
  seedPublicData(db);

  db.prepare(
    `INSERT INTO gameweeks (id, name, deadline_time, average_entry_score, highest_score, is_current, is_finished, updated_at)
     VALUES
     (1, 'Gameweek 1', ?, 50, 100, 0, 1, ?),
     (2, 'Gameweek 2', ?, 51, 101, 1, 0, ?)`,
  ).run("2026-08-15T10:00:00.000Z", now(), "2026-08-22T10:00:00.000Z", now());

  db.prepare(
    `INSERT INTO my_team_accounts (
      id, email, encrypted_credentials, manager_id, entry_id, player_first_name, player_last_name,
      team_name, auth_status, last_authenticated_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    1,
    "ian@fpl.local",
    "encrypted",
    77,
    321,
    "Ian",
    "Harper",
    "Midnight Press FC",
    "authenticated",
    now(),
    now(),
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("RivalSyncService", () => {
  it("paginates league standings and persists rival entries plus league membership", async () => {
    const db = createDatabase(makeDbPath());
    seedPhaseOneData(db);

    const client = {
      getClassicLeagueStandings: vi
        .fn()
        .mockResolvedValueOnce({
          league: { id: 99, name: "Writers ML" },
          standings: {
            has_next: true,
            results: [
              { entry: 501, player_name: "Brad", entry_name: "Brad FC", rank: 1, total: 130 },
            ],
          },
        })
        .mockResolvedValueOnce({
          league: { id: 99, name: "Writers ML" },
          standings: {
            has_next: false,
            results: [
              { entry: 502, player_name: "Sean", entry_name: "Sean FC", rank: 2, total: 125 },
            ],
          },
        }),
    };

    const service = new RivalSyncService(db, client as any);
    const result = await service.syncLeagueStandings(99, "classic", 1);

    const rivals = db
      .prepare(
        `SELECT entry_id AS entryId, player_name AS playerName, team_name AS teamName, total_points AS totalPoints
         FROM rival_entries
         ORDER BY entry_id`,
      )
      .all() as Array<{
      entryId: number;
      playerName: string;
      teamName: string;
      totalPoints: number;
    }>;
    const leagues = db
      .prepare(
        `SELECT league_id AS leagueId, league_type AS leagueType, account_id AS accountId, league_name AS leagueName
         FROM rival_leagues`,
      )
      .all();

    expect(result).toMatchObject({ leagueId: 99, leagueType: "classic", rivalCount: 2 });
    expect(client.getClassicLeagueStandings).toHaveBeenCalledTimes(2);
    expect(rivals).toEqual([
      { entryId: 501, playerName: "Brad", teamName: "Brad FC", totalPoints: 130 },
      { entryId: 502, playerName: "Sean", teamName: "Sean FC", totalPoints: 125 },
    ]);
    expect(leagues).toEqual([
      { leagueId: 99, leagueType: "classic", accountId: 1, leagueName: "Writers ML" },
    ]);
  });

  it("syncs one rival across gameweeks and records progress in rival tables", async () => {
    const db = createDatabase(makeDbPath());
    seedPhaseOneData(db);

    const client = {
      getRivalEntryHistory: vi.fn().mockResolvedValue({
        current: [
          {
            event: 1,
            points: 62,
            total_points: 62,
            overall_rank: 15000,
            rank: 15000,
            event_transfers: 1,
            event_transfers_cost: 4,
            points_on_bench: 5,
          },
          {
            event: 2,
            points: 71,
            total_points: 133,
            overall_rank: 9000,
            rank: 9000,
            event_transfers: 0,
            event_transfers_cost: 0,
            points_on_bench: 3,
          },
        ],
      }),
      getPublicEntryPicks: vi
        .fn()
        .mockResolvedValueOnce({
          active_chip: null,
          picks: [
            { element: 10, position: 1, multiplier: 2, is_captain: true, is_vice_captain: false },
            { element: 11, position: 12, multiplier: 0, is_captain: false, is_vice_captain: true },
          ],
        })
        .mockResolvedValueOnce({
          active_chip: null,
          picks: [
            { element: 11, position: 1, multiplier: 2, is_captain: true, is_vice_captain: false },
            { element: 10, position: 12, multiplier: 0, is_captain: false, is_vice_captain: true },
          ],
        }),
    };

    db.prepare(
      `INSERT INTO rival_entries (
        entry_id, player_name, team_name, overall_rank, total_points, last_synced_gw, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(501, "Brad", "Brad FC", 1, 133, null, now());

    const service = new RivalSyncService(db, client as any);
    const result = await service.syncRivalOnDemand(99, 501, 1);

    const summary = db
      .prepare(
        `SELECT last_synced_gw AS lastSyncedGw FROM rival_entries WHERE entry_id = ?`,
      )
      .get(501) as { lastSyncedGw: number | null };
    const gameweeks = db
      .prepare(
        `SELECT gameweek_id AS gameweekId, points, total_points AS totalPoints
         FROM rival_gameweeks
         WHERE entry_id = ?
         ORDER BY gameweek_id`,
      )
      .all(501);
    const picks = db
      .prepare(
        `SELECT gameweek_id AS gameweekId, player_id AS playerId, position, multiplier
         FROM rival_picks
         WHERE entry_id = ?
         ORDER BY gameweek_id, position`,
      )
      .all(501);

    expect(result).toMatchObject({ entryId: 501, syncedGameweeks: 2, lastSyncedGw: 2 });
    expect(client.getRivalEntryHistory).toHaveBeenCalledWith(501);
    expect(client.getPublicEntryPicks).toHaveBeenCalledTimes(2);
    expect(summary.lastSyncedGw).toBe(2);
    expect(gameweeks).toEqual([
      { gameweekId: 1, points: 62, totalPoints: 62 },
      { gameweekId: 2, points: 71, totalPoints: 133 },
    ]);
    expect(picks).toEqual([
      { gameweekId: 1, playerId: 10, position: 1, multiplier: 2 },
      { gameweekId: 1, playerId: 11, position: 12, multiplier: 0 },
      { gameweekId: 2, playerId: 11, position: 1, multiplier: 2 },
      { gameweekId: 2, playerId: 10, position: 12, multiplier: 0 },
    ]);
  });
});
