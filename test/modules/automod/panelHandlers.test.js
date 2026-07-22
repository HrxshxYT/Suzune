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

  it("navigates to the native view and back", async () => {
    const s = state({ view: "main" });
    await handleAutomodComponent({ customId: "am:nav:native:o1" }, s, ctx());
    expect(s.view).toBe("native");
    await handleAutomodComponent({ customId: "am:nav:main:o1" }, s, ctx());
    expect(s.view).toBe("main");
  });

  it("toggles a native rule column", async () => {
    const c = ctx();
    const s = state({ automod: { nativeInvites: true } });
    await handleAutomodComponent({ customId: "am:ntog:nativeInvites:o1" }, s, c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { nativeInvites: false });
    expect(s.automod.nativeInvites).toBe(false);
  });

  it("sets the native timeout duration from the select", async () => {
    const c = ctx();
    const s = state({ automod: {} });
    await handleAutomodComponent({ customId: "am:ntimeout:o1", values: ["600"] }, s, c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { nativeTimeoutSeconds: 600 });
    expect(s.automod.nativeTimeoutSeconds).toBe(600);
  });

  it("sets and clears the native alert channel", async () => {
    const c = ctx();
    const s = state({ automod: {} });
    await handleAutomodComponent({ customId: "am:nalertch:o1", values: ["c7"] }, s, c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { nativeAlertChannelId: "c7" });
    await handleAutomodComponent({ customId: "am:nalertch:o1", values: [] }, s, c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { nativeAlertChannelId: null });
  });

  it("sync enables native AutoMod, provisions rules, and returns 'handled'", async () => {
    const c = ctx();
    const s = state({ automod: { nativeEnabled: false, nativeInvites: true } });
    const i = {
      customId: "am:nsync:o1",
      guild: {
        members: { me: { permissions: { has: () => true } } },
        autoModerationRules: { fetch: vi.fn(async () => new Map()), create: vi.fn(async () => ({})) },
      },
      deferUpdate: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
    };
    const dir = await handleAutomodComponent(i, s, c, () => ({ embeds: [], components: [] }));
    expect(dir).toBe("handled");
    expect(s.automod.nativeEnabled).toBe(true);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { nativeEnabled: true });
    expect(i.deferUpdate).toHaveBeenCalled();
    expect(s.lastSync.ok).toBe(true);
  });

  it("remove deletes rules and disables native AutoMod", async () => {
    const c = ctx();
    const s = state({ automod: { nativeEnabled: true } });
    const i = {
      customId: "am:nremove:o1",
      guild: {
        members: { me: { permissions: { has: () => true } } },
        autoModerationRules: { fetch: vi.fn(async () => new Map()) },
      },
      deferUpdate: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
    };
    const dir = await handleAutomodComponent(i, s, c, () => ({ embeds: [], components: [] }));
    expect(dir).toBe("handled");
    expect(s.automod.nativeEnabled).toBe(false);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { nativeEnabled: false });
  });
});
