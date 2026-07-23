import { describe, it, expect, vi } from "vitest";
import { applyAutomodAction } from "../../../src/modules/automod/action.js";

function message() {
  return {
    delete: vi.fn(async () => {}),
    guild: { id: "g1", name: "Guild One" },
    client: { user: { id: "bot" } },
  };
}
function member(id = "u1") {
  return { id, user: { id, send: vi.fn(async () => {}) } };
}
const logger = { error: vi.fn(), debug: vi.fn() };

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
    const mem = { ...member(), timeout: vi.fn(async () => {}) };
    const cases = { createCase: vi.fn(async () => ({})) };
    await applyAutomodAction({
      message: m,
      member: mem,
      config: { action: "timeout", timeoutSeconds: 300 },
      reason: "caps",
      cases,
      logger,
    });
    expect(mem.timeout).toHaveBeenCalledWith(300000, expect.any(String));
    expect(cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "timeout" }));
  });

  it("DMs the offender on a warn when dmOnAction is on", async () => {
    const m = message();
    const mem = member();
    const cases = { createCase: vi.fn(async () => ({})) };
    await applyAutomodAction({
      message: m,
      member: mem,
      config: { action: "warn" },
      reason: "invite link",
      cases,
      logger,
      dmOnAction: true,
    });
    expect(mem.user.send).toHaveBeenCalledTimes(1);
    const payload = mem.user.send.mock.calls[0][0];
    expect(JSON.stringify(payload)).toContain("invite link");
  });

  it("does not DM the offender when dmOnAction is off", async () => {
    const m = message();
    const mem = { ...member(), timeout: vi.fn(async () => {}) };
    const cases = { createCase: vi.fn(async () => ({})) };
    await applyAutomodAction({
      message: m,
      member: mem,
      config: { action: "timeout", timeoutSeconds: 300 },
      reason: "caps",
      cases,
      logger,
      dmOnAction: false,
    });
    expect(mem.user.send).not.toHaveBeenCalled();
  });

  it("does not DM on a plain delete even when dmOnAction is on", async () => {
    const m = message();
    const mem = member();
    const cases = { createCase: vi.fn() };
    await applyAutomodAction({
      message: m,
      member: mem,
      config: { action: "delete" },
      reason: "spam",
      cases,
      logger,
      dmOnAction: true,
    });
    expect(mem.user.send).not.toHaveBeenCalled();
  });
});
