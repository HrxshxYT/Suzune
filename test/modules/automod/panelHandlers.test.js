import { describe, it, expect, vi } from "vitest";
import { handleAutomodComponent } from "../../../src/modules/automod/panel/handlers.js";

const ctx = () => ({ config: { updateAutomod: vi.fn(async () => ({})) } });
const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  automod: { enabled: false, antiSpam: true, action: "delete", exemptRoles: [], exemptChannels: [] },
  ...over,
});

describe("handleAutomodComponent", () => {
  it("toggles the enabled flag", async () => {
    const c = ctx();
    const s = state();
    const dir = await handleAutomodComponent({ customId: "am:tog:enabled:o1" }, s, c);
    expect(dir).toBe("update");
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { enabled: true });
    expect(s.automod.enabled).toBe(true);
  });

  it("toggles a filter column off", async () => {
    const c = ctx();
    await handleAutomodComponent({ customId: "am:tog:antiSpam:o1" }, state(), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { antiSpam: false });
  });

  it("sets the action from the select", async () => {
    const c = ctx();
    await handleAutomodComponent({ customId: "am:action:o1", values: ["timeout"] }, state(), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { action: "timeout" });
  });

  it("replaces exempt roles from the role select", async () => {
    const c = ctx();
    const s = state();
    await handleAutomodComponent({ customId: "am:exroles:o1", values: ["r1", "r2"] }, s, c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { exemptRoles: ["r1", "r2"] });
    expect(s.automod.exemptRoles).toEqual(["r1", "r2"]);
  });

  it("replaces exempt channels from the channel select", async () => {
    const c = ctx();
    await handleAutomodComponent({ customId: "am:exchans:o1", values: ["c9"] }, state(), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { exemptChannels: ["c9"] });
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleAutomodComponent({ customId: "am:close:o1" }, state(), ctx());
    expect(dir).toBe("close");
  });
});
