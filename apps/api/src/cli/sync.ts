import { createDatabase } from "../db/database.js";
import { SyncService } from "../services/syncService.js";

function parseGameweekArg(argv: string[]) {
  const gameweekIndex = argv.findIndex((arg) => arg === "--gameweek" || arg === "-g");
  if (gameweekIndex >= 0) {
    const value = argv[gameweekIndex + 1];
    const parsed = Number(value);
    if (!value || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("`--gameweek` must be followed by a positive integer.");
    }
    return parsed;
  }

  const prefixedArg = argv.find((arg) => arg.startsWith("--gameweek="));
  if (!prefixedArg) {
    return undefined;
  }

  const parsed = Number(prefixedArg.split("=")[1]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("`--gameweek` must be a positive integer.");
  }

  return parsed;
}

function parsePlayerArg(argv: string[]) {
  const idx = argv.findIndex((a) => a === "--player" || a === "-p");
  if (idx >= 0) {
    const value = argv[idx + 1];
    const parsed = Number(value);
    if (!value || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("`--player` must be followed by a positive integer.");
    }
    return parsed;
  }

  const prefixed = argv.find((a) => a.startsWith("--player="));
  if (!prefixed) {
    return undefined;
  }

  const parsed = Number(prefixed.split("=")[1]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("`--player` must be a positive integer.");
  }

  return parsed;
}

function parseForceArg(argv: string[]) {
  return argv.includes("--force") || argv.includes("-f");
}

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
const argv = process.argv.slice(2);
const gameweek = parseGameweekArg(argv);
const playerId = parsePlayerArg(argv);
const force = parseForceArg(argv);

const syncPromise = playerId
  ? service.syncPlayer(playerId, gameweek, force)
  : gameweek
    ? service.syncGameweek(gameweek, force)
    : service.syncAll(force);

syncPromise
  .then((result) => {
    const scope = playerId !== undefined
      ? `player ${playerId}${gameweek ? ` / gameweek ${gameweek}` : ""}`
      : gameweek !== undefined
        ? `gameweek ${gameweek}`
        : "full dataset";
    console.log(`Sync completed for ${scope}${force ? " (forced)" : ""}. Run ${result.runId} refreshed ${result.syncedPlayers} player summaries.`);
  })
  .catch((error) => {
    console.error("Sync failed:", error);
    process.exitCode = 1;
  });
