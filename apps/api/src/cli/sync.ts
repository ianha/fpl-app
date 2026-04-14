import { createDatabase } from "../db/database.js";
import { SyncService } from "../services/syncService.js";
import { pathToFileURL } from "node:url";
import { hasFlag, parseOptionalPositiveIntegerArg } from "./argParsers.js";

export function parseSyncArgs(argv: string[]) {
  return {
    gameweek: parseOptionalPositiveIntegerArg(argv, ["--gameweek", "-g"], "--gameweek"),
    playerId: parseOptionalPositiveIntegerArg(argv, ["--player", "-p"], "--player"),
    force: hasFlag(argv, ["--force", "-f"]),
  };
}

export async function runSyncCli(argv = process.argv.slice(2)) {
  const db = createDatabase();
  const logger = {
    info(message: string) {
      console.log(`[${new Date().toISOString()}] INFO  ${message}`);
    },
    error(message: string) {
      console.error(`[${new Date().toISOString()}] ERROR ${message}`);
    },
  };
  const service = new SyncService(db, undefined, logger);
  const { gameweek, playerId, force } = parseSyncArgs(argv);

  const result = await (
    playerId
      ? service.syncPlayer(playerId, gameweek, force)
      : gameweek
        ? service.syncGameweek(gameweek, force)
        : service.syncAll(force)
  );

  const scope = playerId !== undefined
    ? `player ${playerId}${gameweek ? ` / gameweek ${gameweek}` : ""}`
    : gameweek !== undefined
      ? `gameweek ${gameweek}`
      : "full dataset";
  const pendingSuffix =
    "pendingMlEvaluationGameweeks" in result &&
    Array.isArray(result.pendingMlEvaluationGameweeks) &&
    result.pendingMlEvaluationGameweeks.length > 0
      ? ` Pending ML evaluation for gameweeks: ${result.pendingMlEvaluationGameweeks.join(", ")}.`
      : "";

  console.log(
    `Sync completed for ${scope}${force ? " (forced)" : ""}. Run ${result.runId} refreshed ${result.syncedPlayers} player summaries.${pendingSuffix}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runSyncCli().catch((error) => {
    console.error("Sync failed:", error);
    process.exitCode = 1;
  });
}
