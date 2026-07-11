import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startPresenceRotation,
  PRESENCE_STATUSES,
  PRESENCE_INTERVAL_MS,
} from "../../../src/modules/presence/presence.js";

function client() {
  return { user: { setPresence: vi.fn() } };
}

describe("startPresenceRotation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("has the two requested statuses and a 3s interval", () => {
    expect(PRESENCE_INTERVAL_MS).toBe(10000);
    expect(PRESENCE_STATUSES.map((s) => s.name)).toEqual([
      "/help",
      "High on Joint",
    ]);
  });

  it("applies the first status immediately", () => {
    const c = client();
    startPresenceRotation(c, { intervalMs: 3000 });
    expect(c.user.setPresence).toHaveBeenCalledTimes(1);
    expect(c.user.setPresence.mock.calls[0][0].activities[0].name).toBe(
      "/help",
    );
  });

  it("switches to the next status every 3 seconds and cycles back", () => {
    const c = client();
    startPresenceRotation(c, { intervalMs: 3000 });

    vi.advanceTimersByTime(3000);
    expect(c.user.setPresence.mock.calls[1][0].activities[0].name).toBe("High on Joint");

    vi.advanceTimersByTime(3000);
    expect(c.user.setPresence.mock.calls[2][0].activities[0].name).toBe(
      "/help",
    );

    expect(c.user.setPresence).toHaveBeenCalledTimes(3);
  });

  it("swallows setPresence errors and keeps rotating", () => {
    const c = client();
    c.user.setPresence.mockImplementationOnce(() => {
      throw new Error("gateway not ready");
    });
    const logger = { error: vi.fn() };
    expect(() => startPresenceRotation(c, { intervalMs: 3000, logger })).not.toThrow();
    expect(logger.error).toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(c.user.setPresence).toHaveBeenCalledTimes(2);
  });
});
