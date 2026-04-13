import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { createDatabase } from "../db/database.js";
import { MyTeamSyncService } from "../my-team/myTeamSyncService.js";

type SyncResult = { syncedGameweeks: number };
type SyncAllResult =
  | { accountId: number; entryId: number | null; syncedGameweeks: number; noop?: boolean }
  | { accountId: number; entryId: number | null; syncedGameweeks: number; error: string; isAuthError?: boolean };

type KnownAccount = {
  id: number;
  email: string;
  entryId?: number | null;
};

export type SyncMyTeamPrompt = {
  ask(question: string, options?: { sensitive?: boolean }): Promise<string>;
  close(): void;
};

type SyncMyTeamService = Pick<
  MyTeamSyncService,
  "linkAccountWithCode" | "syncAccount" | "syncAll" | "getAccounts"
> & {
  buildAuthUrl(): Promise<{ authUrl: string; codeVerifier: string; state: string }>;
};

type RunSyncMyTeamDeps = {
  createService?: () => SyncMyTeamService;
  createPrompt?: () => SyncMyTeamPrompt;
  isInteractive?: boolean;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  openUrl?: (url: string) => void;
};

type ParsedSyncMyTeamArgs = {
  force: boolean;
  gameweek?: number;
  accountId?: number;
  accountEmail?: string;
};

function parseGameweekArg(argv: string[]) {
  const gameweekIndex = argv.findIndex((arg) => arg === "--gameweek" || arg === "-g");
  if (gameweekIndex >= 0) {
    const value = argv[gameweekIndex + 1];
    if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
      throw new Error("`--gameweek` must be followed by a positive integer.");
    }
    return Number(value);
  }

  const prefixedArg = argv.find((arg) => arg.startsWith("--gameweek="));
  if (!prefixedArg) return undefined;

  const value = prefixedArg.split("=")[1];
  if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
    throw new Error("`--gameweek` must be a positive integer.");
  }
  return Number(value);
}

function parsePositiveIntegerArg(argv: string[], names: string[], label: string) {
  const argIndex = argv.findIndex((arg) => names.includes(arg));
  if (argIndex >= 0) {
    const value = argv[argIndex + 1];
    if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
      throw new Error(`\`${label}\` must be followed by a positive integer.`);
    }
    return Number(value);
  }

  const prefixedArg = argv.find((arg) => names.some((name) => arg.startsWith(`${name}=`)));
  if (!prefixedArg) return undefined;

  const value = prefixedArg.split("=")[1];
  if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
    throw new Error(`\`${label}\` must be a positive integer.`);
  }
  return Number(value);
}

function parseStringArg(argv: string[], names: string[], label: string) {
  const argIndex = argv.findIndex((arg) => names.includes(arg));
  if (argIndex >= 0) {
    const value = argv[argIndex + 1]?.trim();
    if (!value) {
      throw new Error(`\`${label}\` must be followed by a value.`);
    }
    return value;
  }

  const prefixedArg = argv.find((arg) => names.some((name) => arg.startsWith(`${name}=`)));
  if (!prefixedArg) return undefined;

  const value = prefixedArg.split("=")[1]?.trim();
  if (!value) {
    throw new Error(`\`${label}\` must be a non-empty value.`);
  }
  return value;
}

function isAuthRecoveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("FPL login failed") ||
    message.includes("re-authentication") ||
    message.includes("relink") ||
    message.includes("no FPL team entry ID") ||
    message.includes("deprecated format") ||
    message.includes("FPL request failed (401)") ||
    message.includes("FPL request failed (403)")
  );
}

function createPrompt(): SyncMyTeamPrompt {
  const mutedOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!(mutedOutput as Writable & { muted?: boolean }).muted) {
        process.stdout.write(chunk, encoding as BufferEncoding);
      }
      callback();
    },
  }) as Writable & { muted?: boolean };

  const rl = createInterface({
    input: process.stdin,
    output: mutedOutput,
    terminal: true,
  });

  return {
    async ask(question: string, options?: { sensitive?: boolean }) {
      mutedOutput.muted = options?.sensitive === true;
      const answer = await rl.question(question);
      mutedOutput.muted = false;
      if (options?.sensitive) {
        process.stdout.write("\n");
      }
      return answer.trim();
    },
    close() {
      rl.close();
    },
  };
}

function defaultCreateService() {
  const db = createDatabase();
  return new MyTeamSyncService(db);
}

function defaultOpenUrl(url: string) {
  // Try to open in browser, silently ignore if not available
  try {
    const { execSync } = require("node:child_process");
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    execSync(`${cmd} "${url}"`, { stdio: "ignore" });
  } catch {
    // Not available or failed — user will open manually
  }
}

function extractCodeFromRedirectUrl(redirectUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(redirectUrl.trim());
  } catch {
    throw new Error("That doesn't look like a valid URL. Paste the full URL from your browser's address bar.");
  }
  const code = parsed.searchParams.get("code");
  if (!code) {
    throw new Error(
      "No authorization code found in that URL. Make sure you pasted the full redirect URL (it should contain '?code=...').",
    );
  }
  return code;
}

async function collectOAuthCode(
  service: SyncMyTeamService,
  prompt: SyncMyTeamPrompt | null,
  log: (message: string) => void,
  openUrl: (url: string) => void,
): Promise<{ code: string; codeVerifier: string }> {
  if (!prompt) {
    throw new Error(
      "Interactive FPL login is not available in this terminal. Re-run `sync:my-team` in an interactive terminal.",
    );
  }

  const { authUrl, codeVerifier } = await service.buildAuthUrl();

  log("\nOpen this URL in your browser to log in to FPL:");
  log(`\n  ${authUrl}\n`);
  openUrl(authUrl);

  const redirectUrl = await prompt.ask(
    "After logging in, paste the URL from your browser's address bar: ",
  );
  const code = extractCodeFromRedirectUrl(redirectUrl);
  return { code, codeVerifier };
}

async function oauthLinkAndSync(
  service: SyncMyTeamService,
  prompt: SyncMyTeamPrompt | null,
  log: (message: string) => void,
  openUrl: (url: string) => void,
  gameweek: number | undefined,
) {
  const { code, codeVerifier } = await collectOAuthCode(service, prompt, log, openUrl);
  const { accountId, email, entryId } = await service.linkAccountWithCode(code, codeVerifier);
  const result = await service.syncAccount(accountId, true, gameweek);
  return { accountId, email, entryId, result };
}

function findKnownAccount(service: SyncMyTeamService, matcher: (account: KnownAccount) => boolean) {
  const accounts = service.getAccounts() as KnownAccount[];
  return accounts.find(matcher);
}

export function parseSyncMyTeamArgs(argv: string[]): ParsedSyncMyTeamArgs {
  const force = argv.includes("--force");
  const gameweek = parseGameweekArg(argv);
  const accountId = parsePositiveIntegerArg(argv, ["--account", "-a"], "--account");
  const accountEmail = parseStringArg(argv, ["--email", "-e"], "--email");

  if (accountId && accountEmail) {
    throw new Error("Use either `--account` or `--email`, not both.");
  }

  return {
    force,
    gameweek,
    accountId,
    accountEmail,
  };
}

export async function runSyncMyTeam(
  argv = process.argv.slice(2),
  deps: RunSyncMyTeamDeps = {},
) {
  const {
    createService = defaultCreateService,
    createPrompt: createCliPrompt = createPrompt,
    isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
    log = console.log,
    warn = console.warn,
    error = console.error,
    openUrl = defaultOpenUrl,
  } = deps;

  const {
    force,
    gameweek,
    accountId,
    accountEmail,
  } = parseSyncMyTeamArgs(argv);

  const service = createService();
  const prompt = isInteractive ? createCliPrompt() : null;

  try {
    if (accountId) {
      try {
        const result = await service.syncAccount(accountId, force, gameweek);
        log(
          `My Team sync completed for account ${accountId}${gameweek ? ` in GW ${gameweek}` : ""}${force ? " (forced)" : ""}. Synced ${result.syncedGameweeks} gameweek(s).`,
        );
        return;
      } catch (caughtError) {
        if (!isAuthRecoveryError(caughtError)) {
          throw caughtError;
        }

        const account = findKnownAccount(service, (candidate) => candidate.id === accountId);
        log(
          `\nAccount ${account?.email ?? accountId} needs to be re-authenticated.`,
        );
        const linked = await oauthLinkAndSync(service, prompt, log, openUrl, gameweek);
        log(
          `My Team sync completed for ${linked.email}${gameweek ? ` in GW ${gameweek}` : ""} (relinked). Synced ${linked.result.syncedGameweeks} gameweek(s).`,
        );
        return;
      }
    }

    if (accountEmail) {
      const account = findKnownAccount(
        service,
        (candidate) => candidate.email.toLowerCase() === accountEmail.toLowerCase(),
      );

      if (!account) {
        throw new Error(`No linked My Team account found for ${accountEmail}.`);
      }

      try {
        const result = await service.syncAccount(account.id, force, gameweek);
        log(
          `My Team sync completed for ${account.email}${gameweek ? ` in GW ${gameweek}` : ""}${force ? " (forced)" : ""}. Synced ${result.syncedGameweeks} gameweek(s).`,
        );
        return;
      } catch (caughtError) {
        if (!isAuthRecoveryError(caughtError)) {
          throw caughtError;
        }

        log(`\n${account.email} needs to be re-authenticated.`);
        const linked = await oauthLinkAndSync(service, prompt, log, openUrl, gameweek);
        log(
          `My Team sync completed for ${linked.email}${gameweek ? ` in GW ${gameweek}` : ""} (relinked). Synced ${linked.result.syncedGameweeks} gameweek(s).`,
        );
        return;
      }
    }

    const results = (await service.syncAll(force, gameweek)) as SyncAllResult[];

    if (results.length === 0) {
      if (!prompt) {
        throw new Error(
          "No My Team accounts are linked. Run `sync:my-team` in an interactive terminal to log in to FPL.",
        );
      }
      log("No linked My Team accounts found. You'll be taken through FPL login to link and sync.");
      const linked = await oauthLinkAndSync(service, prompt, log, openUrl, gameweek);
      log(
        `My Team sync completed for ${linked.email}${gameweek ? ` in GW ${gameweek}` : ""} (linked). Synced ${linked.result.syncedGameweeks} gameweek(s).`,
      );
      return;
    }

    const failures = results.filter((result) => "error" in result);
    const authFailures = failures.filter((failure) => failure.isAuthError);
    const unexpectedFailures = failures.filter((failure) => !failure.isAuthError);

    if (authFailures.length > 0 && !prompt) {
      throw new Error(
        `Authentication expired for ${authFailures.length} My Team account(s). Re-run \`sync:my-team\` in an interactive terminal to re-authenticate.`,
      );
    }

    log(
      `My Team sync completed${gameweek ? ` for GW ${gameweek}` : ""}${force ? " (forced)" : ""}. Synced ${results.length - failures.length} account(s).`,
    );

    let recoveredAuthFailures = 0;
    if (authFailures.length > 0 && prompt) {
      for (const failure of authFailures) {
        const account = findKnownAccount(service, (candidate) => candidate.id === failure.accountId);
        if (!account) {
          throw new Error(
            `Account ${failure.accountId} needs re-authentication, but no linked email was found locally for credential recovery.`,
          );
        }

        log(`\n${account.email} needs to be re-authenticated.`);
        const linked = await oauthLinkAndSync(service, prompt, log, openUrl, gameweek);
        recoveredAuthFailures += 1;
        log(
          `Relinked ${linked.email} and synced ${linked.result.syncedGameweeks} gameweek(s).`,
        );
      }
    }

    if (authFailures.length > recoveredAuthFailures) {
      warn(
        authFailures
          .slice(recoveredAuthFailures)
          .map((failure) => `Account ${failure.accountId} needs re-authentication: ${failure.error}`)
          .join("\n"),
      );
    }

    if (recoveredAuthFailures > 0) {
      log(`Recovered ${recoveredAuthFailures} account(s) by relinking after auth prompts.`);
    }

    if (unexpectedFailures.length > 0) {
      error(
        unexpectedFailures
          .map((failure) => `Account ${failure.accountId} sync failed unexpectedly: ${failure.error}`)
          .join("\n"),
      );
      process.exitCode = 1;
    }
  } finally {
    prompt?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSyncMyTeam().catch((caughtError) => {
    console.error(caughtError instanceof Error ? caughtError.message : String(caughtError));
    process.exitCode = 1;
  });
}
