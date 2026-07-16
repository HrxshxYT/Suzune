import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DashboardService } from "../../../src/modules/dashboard/DashboardService.js";

describe("DashboardService", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("edits the message on each refresh interval", async () => {
    const svc = new DashboardService({ refreshMs: 5000, maxTicks: 3 });
    const message = { id: "m1", edit: vi.fn(async () => {}) };
    const build = vi.fn(async () => ({ embeds: ["x"] }));

    svc.start(message, build);
    expect(svc.activeCount).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(message.edit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(message.edit).toHaveBeenCalledTimes(2);
  });

  it("stops after maxTicks", async () => {
    const svc = new DashboardService({ refreshMs: 1000, maxTicks: 2 });
    const message = { id: "m2", edit: vi.fn(async () => {}) };

    svc.start(message, async () => ({}));
    await vi.advanceTimersByTimeAsync(5000);
    expect(message.edit).toHaveBeenCalledTimes(2);
    expect(svc.activeCount).toBe(0);
  });

  it("stops the loop when an edit fails", async () => {
    const svc = new DashboardService({ refreshMs: 1000, maxTicks: 10 });
    const message = { id: "m3", edit: vi.fn(async () => { throw new Error("gone"); }) };

    svc.start(message, async () => ({}));
    await vi.advanceTimersByTimeAsync(1000);
    expect(svc.activeCount).toBe(0);
  });

  it("replaces an existing loop for the same message", () => {
    const svc = new DashboardService();
    const message = { id: "m4", edit: vi.fn() };
    svc.start(message, async () => ({}));
    svc.start(message, async () => ({}));
    expect(svc.activeCount).toBe(1);
    svc.stopAll();
    expect(svc.activeCount).toBe(0);
  });
});
