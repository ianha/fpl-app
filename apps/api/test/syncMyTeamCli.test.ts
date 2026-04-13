import { describe, expect, it, vi } from "vitest";
import {
  parseSyncMyTeamArgs,
  runSyncMyTeam,
  type SyncMyTeamPrompt,
} from "../src/cli/syncMyTeam.js";

const MOCK_AUTH_URL = "https://account.premierleague.com/as/authorize?client_id=test";
const MOCK_REDIRECT_URL = "https://fantasy.premierleague.com/?code=auth-code-123&state=abc";

function createPromptMock(
  responses: Array<string | undefined>,
): SyncMyTeamPrompt {
  const queue = [...responses];
  return {
    ask: vi.fn(async () => queue.shift() ?? ""),
    close: vi.fn(),
  };
}

function createServiceMock(overrides: {
  syncAccount?: ReturnType<typeof vi.fn>;
  syncAll?: ReturnType<typeof vi.fn>;
  getAccounts?: ReturnType<typeof vi.fn>;
  linkAccountWithCode?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    buildAuthUrl: vi.fn(async () => ({ authUrl: MOCK_AUTH_URL, codeVerifier: "mock-verifier", state: "mock-state" })),
    linkAccountWithCode: vi.fn(async () => ({ accountId: 5, email: "ian@fpl.local", entryId: 1234567 })),
    syncAccount: vi.fn(async () => ({ syncedGameweeks: 3 })),
    getAccounts: vi.fn(() => []),
    syncAll: vi.fn(async () => []),
    ...overrides,
  };
}

describe("parseSyncMyTeamArgs", () => {
  it("parses a targeted account sync", () => {
    expect(parseSyncMyTeamArgs(["--account", "3", "--gameweek", "29", "--force"])).toEqual({
      force: true,
      gameweek: 29,
      accountId: 3,
      accountEmail: undefined,
    });
  });

  it("parses an email-targeted sync", () => {
    expect(parseSyncMyTeamArgs(["--email=ian@fpl.local"])).toEqual({
      force: false,
      gameweek: undefined,
      accountId: undefined,
      accountEmail: "ian@fpl.local",
    });
  });

  it("parses gameweek-only flag", () => {
    expect(parseSyncMyTeamArgs(["--gameweek", "32"])).toEqual({
      force: false,
      gameweek: 32,
      accountId: undefined,
      accountEmail: undefined,
    });
  });

  it("rejects conflicting account selectors", () => {
    expect(() => parseSyncMyTeamArgs(["--account", "3", "--email", "ian@fpl.local"])).toThrow(
      "Use either `--account` or `--email`, not both.",
    );
  });
});

describe("runSyncMyTeam", () => {
  it("prompts for OAuth login when no accounts are linked and syncing interactively", async () => {
    const prompt = createPromptMock([MOCK_REDIRECT_URL]);
    const service = createServiceMock({
      syncAll: vi.fn(async () => []),
    });
    const log = vi.fn();
    const openUrl = vi.fn();

    await runSyncMyTeam(["--gameweek", "32"], {
      createService: () => service,
      isInteractive: true,
      createPrompt: () => prompt,
      log,
      warn: vi.fn(),
      error: vi.fn(),
      openUrl,
    });

    expect(service.buildAuthUrl).toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledWith(MOCK_AUTH_URL);
    expect(service.linkAccountWithCode).toHaveBeenCalledWith("auth-code-123", "mock-verifier");
    expect(service.syncAccount).toHaveBeenCalledWith(5, true, 32);
    expect(log).toHaveBeenCalledWith(
      "My Team sync completed for ian@fpl.local in GW 32 (linked). Synced 3 gameweek(s).",
    );
  });

  it("throws when no accounts are linked and the terminal is non-interactive", async () => {
    const service = createServiceMock({
      syncAll: vi.fn(async () => []),
    });

    await expect(
      runSyncMyTeam(["--gameweek", "32"], {
        createService: () => service,
        isInteractive: false,
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    ).rejects.toThrow("No My Team accounts are linked.");
  });

  it("prompts for OAuth relink when a targeted account by ID needs re-authentication", async () => {
    const prompt = createPromptMock([MOCK_REDIRECT_URL]);
    const syncAccount = vi
      .fn()
      .mockRejectedValueOnce(new Error("FPL request failed (401) for /me/"))
      .mockResolvedValueOnce({ syncedGameweeks: 4 });
    const service = createServiceMock({
      syncAccount,
      getAccounts: vi.fn(() => [{ id: 3, email: "ian@fpl.local", entryId: 101 }]),
    });
    const log = vi.fn();
    const openUrl = vi.fn();

    await runSyncMyTeam(["--account", "3"], {
      createService: () => service,
      isInteractive: true,
      createPrompt: () => prompt,
      log,
      warn: vi.fn(),
      error: vi.fn(),
      openUrl,
    });

    expect(service.buildAuthUrl).toHaveBeenCalled();
    expect(service.linkAccountWithCode).toHaveBeenCalledWith("auth-code-123", "mock-verifier");
    expect(syncAccount).toHaveBeenNthCalledWith(1, 3, false, undefined);
    expect(syncAccount).toHaveBeenNthCalledWith(2, 5, true, undefined);
    expect(log).toHaveBeenCalledWith(
      "My Team sync completed for ian@fpl.local (relinked). Synced 4 gameweek(s).",
    );
  });

  it("prompts for OAuth relink when an email-targeted account needs re-authentication", async () => {
    const prompt = createPromptMock([MOCK_REDIRECT_URL]);
    const syncAccount = vi
      .fn()
      .mockRejectedValueOnce(new Error("FPL request failed (401) for /me/"))
      .mockResolvedValueOnce({ syncedGameweeks: 6 });
    const service = createServiceMock({
      syncAccount,
      getAccounts: vi.fn(() => [{ id: 3, email: "ian@fpl.local", entryId: 101 }]),
    });
    const log = vi.fn();
    const openUrl = vi.fn();

    await runSyncMyTeam(["--email", "ian@fpl.local"], {
      createService: () => service,
      isInteractive: true,
      createPrompt: () => prompt,
      log,
      warn: vi.fn(),
      error: vi.fn(),
      openUrl,
    });

    expect(service.buildAuthUrl).toHaveBeenCalled();
    expect(service.linkAccountWithCode).toHaveBeenCalledWith("auth-code-123", "mock-verifier");
    expect(syncAccount).toHaveBeenNthCalledWith(1, 3, false, undefined);
    expect(log).toHaveBeenCalledWith(
      "My Team sync completed for ian@fpl.local (relinked). Synced 6 gameweek(s).",
    );
  });

  it("retries auth-failed accounts during sync-all by prompting for OAuth relink", async () => {
    const prompt = createPromptMock([MOCK_REDIRECT_URL]);
    const service = createServiceMock({
      syncAll: vi.fn(async () => [
        {
          accountId: 9,
          entryId: 101,
          syncedGameweeks: 0,
          error: "FPL request failed (401) for /me/",
          isAuthError: true,
        },
      ]),
      getAccounts: vi.fn(() => [{ id: 9, email: "ian@fpl.local", entryId: 101 }]),
    });
    const log = vi.fn();
    const warn = vi.fn();
    const openUrl = vi.fn();

    await runSyncMyTeam([], {
      createService: () => service,
      isInteractive: true,
      createPrompt: () => prompt,
      log,
      warn,
      error: vi.fn(),
      openUrl,
    });

    expect(warn).not.toHaveBeenCalled();
    expect(service.buildAuthUrl).toHaveBeenCalled();
    expect(service.linkAccountWithCode).toHaveBeenCalledWith("auth-code-123", "mock-verifier");
    expect(service.syncAccount).toHaveBeenCalledWith(5, true, undefined);
    expect(log).toHaveBeenCalledWith("Recovered 1 account(s) by relinking after auth prompts.");
  });

  it("propagates network errors without prompting for OAuth relink", async () => {
    const syncAccount = vi
      .fn()
      .mockRejectedValueOnce(new Error("Could not resolve account.premierleague.com. Check DNS/VPN/network settings."));
    const service = createServiceMock({
      syncAccount,
      getAccounts: vi.fn(() => [{ id: 3, email: "ian@fpl.local", entryId: 101 }]),
    });
    const prompt = createPromptMock([]);
    const openUrl = vi.fn();

    await expect(
      runSyncMyTeam(["--account", "3"], {
        createService: () => service,
        isInteractive: true,
        createPrompt: () => prompt,
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        openUrl,
      }),
    ).rejects.toThrow("Could not resolve");

    expect(prompt.ask).not.toHaveBeenCalled();
    expect(service.buildAuthUrl).not.toHaveBeenCalled();
  });

  it("fails clearly when auth recovery is required but interactive prompts are unavailable", async () => {
    const service = createServiceMock({
      syncAll: vi.fn(async () => [
        {
          accountId: 3,
          entryId: 101,
          syncedGameweeks: 0,
          error: "FPL request failed (401) for /me/",
          isAuthError: true,
        },
      ]),
    });

    await expect(
      runSyncMyTeam([], {
        createService: () => service,
        isInteractive: false,
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    ).rejects.toThrow(
      "Authentication expired for 1 My Team account(s). Re-run `sync:my-team` in an interactive terminal to re-authenticate.",
    );
  });

  it("throws a clear error when the pasted URL contains no auth code", async () => {
    const prompt = createPromptMock(["https://fantasy.premierleague.com/"]);
    const service = createServiceMock({
      syncAll: vi.fn(async () => []),
    });
    const openUrl = vi.fn();

    await expect(
      runSyncMyTeam([], {
        createService: () => service,
        isInteractive: true,
        createPrompt: () => prompt,
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        openUrl,
      }),
    ).rejects.toThrow("No authorization code found in that URL");
  });
});
