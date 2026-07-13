import { describe, it, expect, vi } from "vitest";
import { formatGuardStatus, createDebouncer } from "../../../src/modules/watchvc/status.js";

describe("formatGuardStatus", () => {
  it("formats the guard badge", () => {
    expect(formatGuardStatus(1234)).toBe("🛡️ Guarding 1234 members");
    expect(formatGuardStatus(1)).toBe("🛡️ Guarding 1 members");
  });
});

describe("createDebouncer", () => {
  it("collapses rapid calls per key into one", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createDebouncer(45000);
    d.schedule("g1", fn);
    d.schedule("g1", fn);
    d.schedule("g1", fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(45000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("keeps separate keys independent and cancels", () => {
    vi.useFakeTimers();
    const a = vi.fn();
    const b = vi.fn();
    const d = createDebouncer(1000);
    d.schedule("a", a);
    d.schedule("b", b);
    d.cancel("a");
    vi.advanceTimersByTime(1000);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
