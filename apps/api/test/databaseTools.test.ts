import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { now, seedPublicData } from "./myTeamFixtures.js";
import {
  buildDatabaseSchema,
  executeReadOnlyQuery,
  isSafeReadOnlyQuery,
  SENSITIVE_QUERY_ERROR_MESSAGE,
} from "../src/chat/databaseTools.js";

let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fpl-db-tools-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("databaseTools", () => {
  it("allows only SELECT and WITH queries", () => {
    expect(isSafeReadOnlyQuery("SELECT 1")).toBe(true);
    expect(isSafeReadOnlyQuery("WITH sample AS (SELECT 1) SELECT * FROM sample")).toBe(true);
    expect(isSafeReadOnlyQuery("DELETE FROM players")).toBe(false);
  });

  it("builds the annotated schema and executes read-only queries", () => {
    const db = createDatabase(path.join(tempDir, "database-tools.sqlite"));
    seedPublicData(db);

    const schema = buildDatabaseSchema(db);
    const players = executeReadOnlyQuery(db, "SELECT id, web_name FROM players ORDER BY id LIMIT 1") as Array<{
      id: number;
      web_name: string;
    }>;

    expect(schema.some((table) => table.table === "players")).toBe(true);
    expect(players[0]).toMatchObject({ id: 10, web_name: "Saka" });
  });

  it("blocks mutating WITH queries even when they start with an allowed token", () => {
    const db = createDatabase(path.join(tempDir, "database-tools-mutation.sqlite"));
    seedPublicData(db);

    expect(() =>
      executeReadOnlyQuery(
        db,
        "WITH target AS (SELECT id FROM players WHERE id = 10) DELETE FROM players WHERE id IN (SELECT id FROM target) RETURNING id",
      ),
    ).toThrow();

    const player = db.prepare("SELECT id FROM players WHERE id = 10").get();
    expect(player).toMatchObject({ id: 10 });
  });

  it("hides sensitive account credential columns from schema and query results", () => {
    const db = createDatabase(path.join(tempDir, "database-tools-sensitive.sqlite"));
    db.prepare(
      `INSERT INTO my_team_accounts (email, encrypted_credentials, updated_at)
       VALUES ('manager@fpl.local', 'secret-ciphertext', ?)`,
    ).run(now());

    const schema = buildDatabaseSchema(db);
    const accountTable = schema.find((table) => table.table === "my_team_accounts");

    expect(accountTable?.columns.map((column) => column.name)).not.toContain("encrypted_credentials");
    expect(accountTable?.createSql).not.toContain("encrypted_credentials");
    expect(() =>
      executeReadOnlyQuery(db, "SELECT encrypted_credentials FROM my_team_accounts"),
    ).toThrow(SENSITIVE_QUERY_ERROR_MESSAGE);
    expect(() => executeReadOnlyQuery(db, "SELECT * FROM my_team_accounts")).toThrow(
      SENSITIVE_QUERY_ERROR_MESSAGE,
    );
  });
});
