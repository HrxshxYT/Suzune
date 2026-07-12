import { describe, it, expect, vi } from "vitest";
import { handleAuditComponent } from "../../../src/modules/audit/panel/handlers.js";
import { CATEGORIES } from "../../../src/modules/audit/categories.js";

const ctx = () => ({ config: { updateAudit: vi.fn(async () => ({})) } });
const state = (over = {}) => ({ guildId: "g1", ownerId: "o1", audit: { enabled: true, events: {} }, ...over });

describe("handleAuditComponent", () => {
  it("sets the channel and enables the feed", async () => {
    const c = ctx();
    const s = state();
    const dir = await handleAuditComponent({ customId: "au:chan:o1", values: ["c9"] }, s, c);
    expect(dir).toBe("update");
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { enabled: true, channelId: "c9" });
    expect(s.audit.channelId).toBe("c9");
  });

  it("toggles a category off (on by default)", async () => {
    const c = ctx();
    await handleAuditComponent({ customId: "au:cat:members:o1" }, state(), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { events: { members: false } });
  });

  it("turns all categories on", async () => {
    const c = ctx();
    await handleAuditComponent({ customId: "au:all:on:o1" }, state(), c);
    const arg = c.config.updateAudit.mock.calls[0][1].events;
    expect(Object.keys(arg)).toHaveLength(CATEGORIES.length);
    expect(Object.values(arg).every((v) => v === true)).toBe(true);
  });

  it("turns all categories off", async () => {
    const c = ctx();
    await handleAuditComponent({ customId: "au:all:off:o1" }, state(), c);
    const arg = c.config.updateAudit.mock.calls[0][1].events;
    expect(Object.keys(arg)).toHaveLength(CATEGORIES.length);
    expect(Object.values(arg).every((v) => v === false)).toBe(true);
  });

  it("disables the feed", async () => {
    const c = ctx();
    const dir = await handleAuditComponent({ customId: "au:disable:o1" }, state(), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { enabled: false });
    expect(dir).toBe("update");
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleAuditComponent({ customId: "au:close:o1" }, state(), ctx());
    expect(dir).toBe("close");
  });
});
