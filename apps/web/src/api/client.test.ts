import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("api client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "https://api.fplytics.test/api");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("subscribes to live updates against the configured API origin", async () => {
    const close = vi.fn();
    const eventSourceMock = vi.fn(() => ({
      close,
      onmessage: null,
      onerror: null,
    }));
    vi.stubGlobal("EventSource", eventSourceMock as unknown as typeof EventSource);

    const { subscribeLiveGw } = await import("./client");
    const unsubscribe = subscribeLiveGw(38, vi.fn());

    expect(eventSourceMock).toHaveBeenCalledWith("https://api.fplytics.test/api/live/gw/38/stream");
    unsubscribe();
    expect(close).toHaveBeenCalled();
  });

  it("builds query-string requests without including undefined params", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { getPlayers, getTransferDecision, getH2HComparison } = await import("./client");

    await getPlayers({ search: "Saka", team: "1" });
    await getTransferDecision(5, { gw: 30, horizon: 3 });
    await getH2HComparison(10, 20, { accountId: 1 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.fplytics.test/api/players?search=Saka&team=1",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.fplytics.test/api/my-team/5/transfer-decision?gw=30&horizon=3",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.fplytics.test/api/leagues/10/h2h/20?accountId=1",
      undefined,
    );
  });
});
