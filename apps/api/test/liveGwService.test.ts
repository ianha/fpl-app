import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveGwService } from "../src/services/liveGwService.js";

const liveResponse = {
  elements: [
    {
      id: 10,
      stats: {
        minutes: 45,
        goals_scored: 1,
        assists: 0,
        clean_sheets: 0,
        saves: 0,
        yellow_cards: 0,
        red_cards: 0,
        own_goals: 0,
        penalties_saved: 0,
        penalties_missed: 0,
        goals_conceded: 1,
        bonus: 2,
        total_points: 7,
      },
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  liveGwService.resetForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockLiveFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => liveResponse,
  } as Response);
}

describe("liveGwService", () => {
  it("stops polling after the final subscriber unsubscribes", async () => {
    const fetchMock = mockLiveFetch();

    liveGwService.startPolling(1, 1_000);
    const unsubscribe = liveGwService.subscribe(1, vi.fn());
    const callsAfterStart = fetchMock.mock.calls.length;

    unsubscribe();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(fetchMock).toHaveBeenCalledTimes(callsAfterStart);
  });

  it("keeps polling while at least one subscriber remains", async () => {
    const fetchMock = mockLiveFetch();

    liveGwService.startPolling(2, 1_000);
    const unsubscribeOne = liveGwService.subscribe(2, vi.fn());
    const unsubscribeTwo = liveGwService.subscribe(2, vi.fn());
    const callsAfterStart = fetchMock.mock.calls.length;

    unsubscribeOne();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterStart);

    const callsWithOneSubscriber = fetchMock.mock.calls.length;
    unsubscribeTwo();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchMock).toHaveBeenCalledTimes(callsWithOneSubscriber);
  });
});
