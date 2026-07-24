import { describe, it, expect, vi } from "vitest";
import { registerFeedRefresh } from "../../../src/modules/automod/feed/refresh.js";

describe("registerFeedRefresh", () => {
  it("does an initial refresh and schedules a recurring one", () => {
    const schedule = vi.fn();
    const refresh = vi.fn().mockResolvedValue({ ok: true });
    registerFeedRefresh({ automodFeed: { refresh }, scheduler: { every: schedule } });
    expect(refresh).toHaveBeenCalled();
    expect(schedule).toHaveBeenCalled();
  });
  it("no-ops without a feed", () => {
    const schedule = vi.fn();
    registerFeedRefresh({ scheduler: { every: schedule } });
    expect(schedule).not.toHaveBeenCalled();
  });
});
