import { describe, it, expect, vi } from "vitest";
import { handleAutomodComponent } from "../../../src/modules/automod/panel/handlers.js";
import { PACKS } from "../../../src/modules/automod/rules/packs/index.js";

const ctx = () => ({
  config: {
    updateAutomod: vi.fn(async () => ({})),
    setPackState: vi.fn(async () => ({})),
    getPackStates: vi.fn(async () => [{ packId: "nitro", enabled: true, installedVersion: 1 }]),
  },
  automodRules: { invalidate: vi.fn() },
});

const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  automod: { enabled: false, heatThreshold: 100, thresholdAction: "timeout", exemptRoles: [], exemptChannels: [] },
  packStates: [],
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

  it("ignores tog for any column other than enabled (legacy filters are gone)", async () => {
    const c = ctx();
    const s = state();
    const dir = await handleAutomodComponent({ customId: "am:tog:antiSpam:o1" }, s, c);
    expect(dir).toBe("update");
    expect(c.config.updateAutomod).not.toHaveBeenCalled();
    expect(s.automod.antiSpam).toBeUndefined();
  });

  it("sets thresholdAction from the action select", async () => {
    const c = ctx();
    const s = state();
    const dir = await handleAutomodComponent({ customId: "am:action:o1", values: ["kick"] }, s, c);
    expect(dir).toBe("update");
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { thresholdAction: "kick" });
    expect(s.automod.thresholdAction).toBe("kick");
  });

  it("delegates the packs select to handlePacksComponent, persisting each pack and refreshing state", async () => {
    const c = ctx();
    const s = state();
    const dir = await handleAutomodComponent(
      { customId: "am:packs:o1", values: ["nitro", "core"] },
      s,
      c,
    );
    expect(dir).toBe("update");
    expect(c.config.setPackState).toHaveBeenCalledTimes(PACKS.length);
    const nitroCall = c.config.setPackState.mock.calls.find(([, id]) => id === "nitro");
    expect(nitroCall[2].enabled).toBe(true);
    const someUnselected = PACKS.find((p) => !["nitro", "core"].includes(p.id));
    const unselectedCall = c.config.setPackState.mock.calls.find(([, id]) => id === someUnselected.id);
    expect(unselectedCall[2].enabled).toBe(false);
    expect(c.automodRules.invalidate).toHaveBeenCalledWith("g1");
    expect(c.config.getPackStates).toHaveBeenCalledWith("g1");
    expect(s.packStates).toEqual([{ packId: "nitro", enabled: true, installedVersion: 1 }]);
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

  it("sets enabled rules from the multi-select (selected = on)", async () => {
    const c = ctx();
    // Start with invites + scam links on; select only scam links + grabbers.
    const s = state({ automod: { nativeInvites: true, nativeScamLinks: true, nativeGrabbers: false } });
    await handleAutomodComponent(
      { customId: "am:nrules:o1", values: ["nativeScamLinks", "nativeGrabbers"] },
      s,
      c,
    );
    const patch = c.config.updateAutomod.mock.calls[0][1];
    expect(patch.nativeInvites).toBe(false); // was on, not selected → off
    expect(patch.nativeGrabbers).toBe(true); // was off, selected → on
    expect(patch).not.toHaveProperty("nativeScamLinks"); // already on, unchanged
    expect(s.automod.nativeInvites).toBe(false);
    expect(s.automod.nativeGrabbers).toBe(true);
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

  it("sync enables native AutoMod, provisions rules, and returns 'handled' (packs are not wired into native sync)", async () => {
    const c = ctx();
    const s = state({ automod: { nativeEnabled: false, nativeInvites: true }, packStates: [{ packId: "nitro", enabled: true }] });
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
