import { describe, it, expect, vi } from "vitest";
import { applyAutomodAction } from "../../../src/modules/automod/action.js";

function message() {
  return {
    delete: vi.fn(async () => {}),
    guild: { id: "g1" },
    client: { user: { id: "bot" } },
  };
}
const logger = { error: vi.fn() };

describe("applyAutomodAction", () => {
  it("deletes on the default action", async () => {
    const m = message();
    const cases = { createCase: vi.fn() };
    await applyAutomodAction({
      message: m,
      member: { id: "u1" },
      config: { action: "delete" },
      reason: "spam",
      cases,
      logger,
    });
    expect(m.delete).toHaveBeenCalled();
    expect(cases.createCase).not.toHaveBeenCalled();
  });

  it("deletes and warns on the warn action", async () => {
    const m = message();
    const cases = { createCase: vi.fn(async () => ({})) };
    await applyAutomodAction({
      message: m,
      member: { id: "u1" },
      config: { action: "warn" },
      reason: "invite",
      cases,
      logger,
    });
    expect(m.delete).toHaveBeenCalled();
    expect(cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "warn" }));
  });

  it("deletes, times out, and records a case on the timeout action", async () => {
    const m = message();
    const member = { id: "u1", timeout: vi.fn(async () => {}) };
    const cases = { createCase: vi.fn(async () => ({})) };
    await applyAutomodAction({
      message: m,
      member,
      config: { action: "timeout", timeoutSeconds: 300 },
      reason: "caps",
      cases,
      logger,
    });
    expect(member.timeout).toHaveBeenCalledWith(300000, expect.any(String));
    expect(cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "timeout" }));
  });
});
