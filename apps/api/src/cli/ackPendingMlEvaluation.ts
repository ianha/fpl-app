import { pathToFileURL } from "node:url";
import type { AppDatabase } from "../db/database.js";
import { createDatabase } from "../db/database.js";
import { MlModelRegistryService } from "../services/mlModelRegistryService.js";
import { hasFlag, parseOptionalPositiveIntegerArg } from "./argParsers.js";

export function parseAckPendingMlEvaluationArgs(argv: string[]) {
  const gameweek = parseOptionalPositiveIntegerArg(argv, ["--gameweek", "-g"], "--gameweek");
  const all = hasFlag(argv, ["--all"]);

  if (all && gameweek !== undefined) {
    throw new Error("Use either `--gameweek` or `--all`, not both.");
  }

  if (!all && gameweek === undefined) {
    throw new Error("Pass `--gameweek <id>` to acknowledge one item or `--all` to clear the full queue.");
  }

  return { gameweek, all };
}

export function acknowledgePendingMlEvaluation(
  db: AppDatabase,
  input: { gameweek?: number; all?: boolean },
) {
  const mlModelRegistryService = new MlModelRegistryService(db);
  const before = mlModelRegistryService.getPendingMlEvaluation()?.gameweekIds ?? [];

  if (input.all) {
    mlModelRegistryService.clearPendingMlEvaluation();
  } else if (input.gameweek !== undefined) {
    mlModelRegistryService.clearPendingMlEvaluation(input.gameweek);
  }

  const after = mlModelRegistryService.getPendingMlEvaluation()?.gameweekIds ?? [];
  const clearedGameweeks = before.filter((gameweekId) => !after.includes(gameweekId));

  return {
    requestedGameweek: input.gameweek ?? null,
    clearedGameweeks,
    remainingGameweeks: after,
  };
}

export async function runAckPendingMlEvaluationCli(argv = process.argv.slice(2)) {
  const db = createDatabase();
  const { gameweek, all } = parseAckPendingMlEvaluationArgs(argv);
  const result = acknowledgePendingMlEvaluation(db, { gameweek, all });

  if (all) {
    console.log(
      `Cleared pending ML evaluation for gameweeks: ${result.clearedGameweeks.join(", ") || "none"}. Remaining queue: ${result.remainingGameweeks.join(", ") || "empty"}.`,
    );
    return result;
  }

  if (result.clearedGameweeks.length === 0) {
    console.log(
      `Gameweek ${gameweek} was not pending. Remaining ML evaluation queue: ${result.remainingGameweeks.join(", ") || "empty"}.`,
    );
    return result;
  }

  console.log(
    `Acknowledged pending ML evaluation for gameweek ${gameweek}. Remaining queue: ${result.remainingGameweeks.join(", ") || "empty"}.`,
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAckPendingMlEvaluationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
