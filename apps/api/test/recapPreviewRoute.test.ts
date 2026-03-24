import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { MyTeamSyncService } from "../src/my-team/myTeamSyncService.js";
import { createApp } from "../src/app.js";
import { seedPublicData } from "./myTeamFixtures.js";

vi.hoisted(() => {
  process.env.FPL_AUTH_SECRET = "test-fpl-secret";
});

vi.mock("../src/my-team/fplSessionClient.js", () => ({
  FplSessionClient: vi.fn().mockImplementation(() => ({
    login: vi.fn(async () => undefined),
    getMe: async () => ({ player: { id: 77, entry: 321, entry_name: "Midnight Press FC" } }),
    getEntry: async () => ({
      player_first_name: "Ian",
      player_last_name: "Harper",
      player_region_name: "Canada",
      name: "Midnight Press FC",
    }),
    getEntryHistory: async () => ({
      current: [
        {
          event: 7,
          points: 64,
          total_points: 612,
          overall_rank: 121482,
          rank: 121482,
          bank: 14,
          value: 1012,
          event_transfers: 1,
          event_transfers_cost: 4,
          points_on_bench: 6,
        },
      ],
      past: [],
    }),
    getTransfers: async () => [],
    getEventPicks: async () => ({
      active_chip: null,
      entry_history: {
        bank: 14,
        value: 1012,
        event_transfers: 1,
        event_transfers_cost: 4,
        points_on_bench: 6,
        points: 64,
        total_points: 612,
        overall_rank: 121482,
        rank: 121482,
      },
      picks: [
        { element: 11, position: 1, multiplier: 2, is_captain: true, is_vice_captain: false, selling_price: 110, purchase_price: 108 },
        { element: 10, position: 2, multiplier: 1, is_captain: false, is_vice_captain: true, selling_price: 105, purchase_price: 103 },
      ],
    }),
    getEntryIdFromMyTeamPage: async () => null,
    getEntryResolutionDiagnostics: () => "none",
  })),
}));

let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fpl-recap-preview-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("GET /api/my-team/:accountId/recap/:gw/preview", () => {
  async function setupDb() {
    const db = createDatabase(path.join(tempDir, "test.sqlite"));
    seedPublicData(db);
    const service = new MyTeamSyncService(db);
    const accountId = service.linkAccount("ian@fpl.local", "super-secret");
    await service.syncAccount(accountId, true);
    return { db, accountId };
  }

  it("returns HTML with correct OG and Twitter card meta tags", async () => {
    const { db, accountId } = await setupDb();
    const app = createApp(db);

    const res = await request(app).get(`/api/my-team/${accountId}/recap/7/preview`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    // OG tags
    expect(res.text).toContain('property="og:image"');
    expect(res.text).toContain(`/api/my-team/${accountId}/recap/7`);
    expect(res.text).toContain('property="og:image:width" content="480"');
    expect(res.text).toContain('property="og:image:height" content="320"');
    expect(res.text).toContain('property="og:title"');
    expect(res.text).toContain("Ian Harper");
    expect(res.text).toContain("GW7 Recap");
    // Twitter card
    expect(res.text).toContain('name="twitter:card" content="summary_large_image"');
    expect(res.text).toContain('name="twitter:image"');
    // Meta refresh redirects browser to the PNG
    expect(res.text).toContain("http-equiv=\"refresh\"");
    expect(res.text).toContain(`/api/my-team/${accountId}/recap/7`);
  });

  it("returns 404 when no recap data exists for that account and gameweek", async () => {
    const { db, accountId } = await setupDb();
    const app = createApp(db);

    const res = await request(app).get(`/api/my-team/${accountId}/recap/99/preview`);

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid params", async () => {
    const { db } = await setupDb();
    const app = createApp(db);

    const res = await request(app).get("/api/my-team/0/recap/0/preview");

    expect(res.status).toBe(400);
  });
});
