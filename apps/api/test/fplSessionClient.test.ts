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

describe("FplSessionClient", () => {
  it("follows login redirects, preserves cookies, and caches discovered entry ids", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          status: 302,
          url: "https://fantasy.premierleague.com/a/login",
          headers: {
            location: "/entry/321/event/1",
          },
          setCookies: ["pl_profile=abc; Path=/; HttpOnly"],
        }),
      )
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>)?.cookie).toBe("pl_profile=abc");

        return createMockResponse({
          body: "<html><script>window.__NEXT_DATA__={}</script></html>",
          status: 200,
          url: "https://fantasy.premierleague.com/entry/321/event/1",
          setCookies: ["pl_session=xyz; Path=/; HttpOnly"],
        });
      });

    vi.stubGlobal("fetch", fetchMock);

    const client = new FplSessionClient();
    await client.login("manager@example.com", "correct-horse-battery-staple");

    await expect(client.getEntryIdFromMyTeamPage()).resolves.toBe(321);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getEntryResolutionDiagnostics()).toContain("login-redirect-location=/entry/321/event/1");
  });

  it("rejects invalid credentials with a stable error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        body: '{"success": false, "password": ["Invalid credentials"]}',
        status: 200,
        url: "https://fantasy.premierleague.com/a/login",
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new FplSessionClient();

    await expect(client.login("manager@example.com", "wrong-password")).rejects.toThrow(
      "FPL login failed. Check your email/password and try again.",
    );
  });

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
