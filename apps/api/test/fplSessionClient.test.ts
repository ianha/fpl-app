import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FplSessionClient,
  extractEntryIdFromHtml,
  extractEntryIdFromUrl,
} from "../src/my-team/fplSessionClient.js";

type MockResponseInit = {
  body?: string;
  headers?: Record<string, string>;
  setCookies?: string[];
  status?: number;
  url: string;
};

function createMockResponse({
  body = "",
  headers = {},
  setCookies = [],
  status = 200,
  url,
}: MockResponseInit) {
  const mockHeaders = {
    get(name: string) {
      return headers[name.toLowerCase()] ?? null;
    },
    getSetCookie() {
      return setCookies;
    },
  } as Headers & { getSetCookie(): string[] };

  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: mockHeaders,
    text: async () => body,
    json: async () => JSON.parse(body),
  } satisfies Partial<Response> & {
    headers: Headers & { getSetCookie(): string[] };
    text(): Promise<string>;
    json(): Promise<unknown>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fplSessionClient helpers", () => {
  it("extracts entry ids from supported HTML patterns", () => {
    expect(extractEntryIdFromHtml('<a href="/entry/321/event/1">View team</a>')).toBe(321);
    expect(extractEntryIdFromHtml('{"entry":654}')).toBe(654);
    expect(extractEntryIdFromHtml('{"entry_id":987}')).toBe(987);
    expect(extractEntryIdFromHtml('{"entryId":432}')).toBe(432);
    expect(extractEntryIdFromHtml('fetch("/api/my-team/765/")')).toBe(765);
    expect(extractEntryIdFromHtml("<html>No team id here</html>")).toBeNull();
  });

  it("extracts entry ids from URLs in path or query string", () => {
    expect(extractEntryIdFromUrl("https://fantasy.premierleague.com/entry/1234/event/1")).toBe(1234);
    expect(extractEntryIdFromUrl("https://fantasy.premierleague.com/my-team?entry=5678")).toBe(5678);
    expect(extractEntryIdFromUrl("https://fantasy.premierleague.com/my-team")).toBeNull();
  });
});

describe("FplSessionClient.buildAuthUrl", () => {
  it("returns a valid PKCE authorization URL with required params", async () => {
    const { authUrl, codeVerifier, state } = await FplSessionClient.buildAuthUrl();

    const url = new URL(authUrl);
    expect(url.hostname).toBe("account.premierleague.com");
    expect(url.pathname).toBe("/as/authorize");
    expect(url.searchParams.get("client_id")).toBe("bfcbaf69-aade-4c1b-8f00-c1cb8a193030");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://fantasy.premierleague.com/");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(state);

    // codeVerifier is a base64url-encoded 32-byte value
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codeVerifier.length).toBeGreaterThan(30);

    // Each call produces fresh PKCE params
    const { codeVerifier: verifier2, state: state2 } = await FplSessionClient.buildAuthUrl();
    expect(codeVerifier).not.toBe(verifier2);
    expect(state).not.toBe(state2);
  });
});

describe("FplSessionClient.loginWithCode", () => {
  it("exchanges the authorization code for tokens and stores them", async () => {
    // Build a minimal id_token JWT (unsigned, for testing)
    const idPayload = btoa(JSON.stringify({ email: "manager@example.com", sub: "user-123" }));
    const idToken = `header.${idPayload}.signature`;

    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        status: 200,
        url: "https://account.premierleague.com/as/token",
        body: JSON.stringify({
          access_token: "access-abc",
          refresh_token: "refresh-xyz",
          id_token: idToken,
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new FplSessionClient();
    const result = await client.loginWithCode("code-123", "verifier-abc");

    expect(result.accessToken).toBe("access-abc");
    expect(result.refreshToken).toBe("refresh-xyz");
    expect(result.email).toBe("manager@example.com");

    // Token should be stored for subsequent requests
    const tokens = client.getTokens();
    expect(tokens.accessToken).toBe("access-abc");
    expect(tokens.refreshToken).toBe("refresh-xyz");

    // Verify request format
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://account.premierleague.com/as/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-123");
    expect(body.get("code_verifier")).toBe("verifier-abc");
  });

  it("throws a clear error when the token endpoint returns an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        status: 400,
        url: "https://account.premierleague.com/as/token",
        body: JSON.stringify({ error: "invalid_grant", error_description: "Code expired" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new FplSessionClient();
    await expect(client.loginWithCode("expired-code", "verifier")).rejects.toThrow(
      "FPL authentication failed (400)",
    );
  });

  it("wraps network failures with a descriptive error", async () => {
    const networkError = new Error("fetch failed", {
      cause: { code: "ENOTFOUND", hostname: "account.premierleague.com" },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    const client = new FplSessionClient();
    await expect(client.loginWithCode("code", "verifier")).rejects.toThrow(
      "Could not resolve account.premierleague.com",
    );
  });
});

describe("FplSessionClient.loginWithAccessToken", () => {
  it("uses Bearer token in subsequent API requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        status: 200,
        url: "https://fantasy.premierleague.com/api/me/",
        body: JSON.stringify({ player: { entry: 321, id: 1, entry_name: "Test" } }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new FplSessionClient();
    client.loginWithAccessToken("my-access-token", "my-refresh-token");
    await client.getMe();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-access-token");
    expect(headers["cookie"]).toBeUndefined();
  });
});

describe("FplSessionClient.tryRefreshAccessToken", () => {
  it("refreshes the access token and updates stored tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        status: 200,
        url: "https://account.premierleague.com/as/token",
        body: JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new FplSessionClient();
    client.loginWithAccessToken("old-access", "old-refresh");
    const refreshed = await client.tryRefreshAccessToken();

    expect(refreshed).toBe(true);
    expect(client.getTokens().accessToken).toBe("new-access");
    expect(client.getTokens().refreshToken).toBe("new-refresh");
  });

  it("returns false when no refresh token is available", async () => {
    const client = new FplSessionClient();
    client.loginWithAccessToken("access-token");
    const refreshed = await client.tryRefreshAccessToken();
    expect(refreshed).toBe(false);
  });

  it("returns false when the refresh endpoint rejects the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      createMockResponse({ status: 401, url: "https://account.premierleague.com/as/token" }),
    ));

    const client = new FplSessionClient();
    client.loginWithAccessToken("access", "bad-refresh");
    const refreshed = await client.tryRefreshAccessToken();
    expect(refreshed).toBe(false);
  });
});

describe("FplSessionClient.getEntryIdFromMyTeamPage", () => {
  it("discovers the entry id from authenticated HTML when /me omits it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          body: "<html>No entry here</html>",
          status: 200,
          url: "https://fantasy.premierleague.com/a/login",
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          body: '<script type="application/json">{"entryId": 654321}</script>',
          status: 200,
          url: "https://fantasy.premierleague.com/my-team",
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = new FplSessionClient();

    await expect(client.getEntryIdFromMyTeamPage()).resolves.toBe(654321);
    await expect(client.getEntryIdFromMyTeamPage()).resolves.toBe(654321);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getEntryResolutionDiagnostics()).toContain("signals=entryId-json");
  });
});
