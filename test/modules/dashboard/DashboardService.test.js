import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DashboardService } from "../../../src/modules/dashboard/DashboardService.js";

describe("DashboardService", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("edits the message on each refresh interval", async () => {
    const svc = new DashboardService({ refreshMs: 90_000 });
    const message = { id: "m1", edit: vi.fn(async () => {}) };
    const build = vi.fn(async () => ({ embeds: ["x"] }));

    svc.start(message, build);
    expect(svc.activeCount).toBe(1);

    await vi.advanceTimersByTimeAsync(90_000);
    expect(message.edit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(message.edit).toHaveBeenCalledTimes(2);
  });

  it("keeps looping (does not stop) on a transient edit failure", async () => {
    const svc = new DashboardService({ refreshMs: 1000 });
    const message = {
      id: "m2",
      edit: vi.fn(async () => {
        const e = new Error("Internal Server Error");
        e.status = 500;
        throw e;
      }),
    };
    svc.start(message, async () => ({}));
    await vi.advanceTimersByTimeAsync(3000);
    expect(message.edit).toHaveBeenCalledTimes(3);
    expect(svc.activeCount).toBe(1); // still running
  });

  it("stops and forgets the row when the message is gone", async () => {
    const deleteMany = vi.fn(async () => {});
    const svc = new DashboardService({ refreshMs: 1000, prisma: { dashboard: { deleteMany } } });
    const message = {
      id: "m3",
      edit: vi.fn(async () => {
        const e = new Error("Unknown Message");
        e.code = 10008;
        throw e;
      }),
    };
    svc.start(message, async () => ({}));
    await vi.advanceTimersByTimeAsync(1000);
    expect(svc.activeCount).toBe(0);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "m3" } });
  });

  it("keeps looping when the render step throws", async () => {
    const svc = new DashboardService({ refreshMs: 1000 });
    const message = { id: "m4", edit: vi.fn(async () => {}) };
    const build = vi.fn(async () => {
      throw new Error("render boom");
    });
    svc.start(message, build);
    await vi.advanceTimersByTimeAsync(2000);
    expect(build).toHaveBeenCalledTimes(2);
    expect(message.edit).not.toHaveBeenCalled();
    expect(svc.activeCount).toBe(1);
  });

  it("replaces an existing loop for the same message", () => {
    const svc = new DashboardService();
    const message = { id: "m5", edit: vi.fn() };
    svc.start(message, async () => ({}));
    svc.start(message, async () => ({}));
    expect(svc.activeCount).toBe(1);
    svc.stopAll();
    expect(svc.activeCount).toBe(0);
  });
});
