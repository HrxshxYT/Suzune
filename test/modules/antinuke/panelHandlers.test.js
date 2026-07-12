import { describe, it, expect, vi } from "vitest";
import { handleAntinukeComponent } from "../../../src/modules/antinuke/panel/handlers.js";

const ctx = () => ({
  config: {
    updateAntinuke: vi.fn(async () => ({})),
    addWhitelist: vi.fn(async () => ({})),
    removeWhitelist: vi.fn(async () => {}),
  },
});
const baseState = () => ({
  guildId: "g1",
  ownerId: "o1",
  serverOwnerId: "o1",
  view: "main",
  antinuke: { enabled: false, autoRevert: true, punishment: "ban" },
  whitelist: [],
});
const render = () => ({ embeds: [], components: [] });

describe("handleAntinukeComponent", () => {
  it("toggles a boolean field and persists it", async () => {
    const c = ctx();
    const state = baseState();
    const dir = await handleAntinukeComponent(
      { customId: "an:tog:enabled:o1", user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(dir).toBe("update");
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { enabled: true });
    expect(state.antinuke.enabled).toBe(true);
  });

  it("sets punishment from a string select", async () => {
    const c = ctx();
    const state = baseState();
    await handleAntinukeComponent(
      { customId: "an:sel:punishment:o1", values: ["kick"], user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { punishment: "kick" });
    expect(state.antinuke.punishment).toBe("kick");
  });

  it("sets the alert channel from a channel select", async () => {
    const c = ctx();
    const state = baseState();
    await handleAntinukeComponent(
      { customId: "an:sel:alert:o1", values: ["c9"], user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { alertChannelId: "c9" });
  });

  it("navigates to the whitelist view and back", async () => {
    const state = baseState();
    await handleAntinukeComponent({ customId: "an:wl:open:o1", user: { id: "o1" } }, state, ctx(), render);
    expect(state.view).toBe("whitelist");
    await handleAntinukeComponent({ customId: "an:wl:back:o1", user: { id: "o1" } }, state, ctx(), render);
    expect(state.view).toBe("main");
  });

  it("adds a role to the whitelist with type 'role'", async () => {
    const c = ctx();
    const state = baseState();
    const roles = new Map([["r5", {}]]);
    await handleAntinukeComponent(
      { customId: "an:wl:add:o1", values: ["r5"], roles: { has: (id) => roles.has(id) }, user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.addWhitelist).toHaveBeenCalledWith("g1", "r5", "role", "o1");
    expect(state.whitelist).toEqual([{ targetId: "r5", type: "role" }]);
  });

  it("adds a user to the whitelist with type 'user'", async () => {
    const c = ctx();
    const state = baseState();
    await handleAntinukeComponent(
      { customId: "an:wl:add:o1", values: ["u5"], roles: { has: () => false }, user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.addWhitelist).toHaveBeenCalledWith("g1", "u5", "user", "o1");
  });

  it("removes a whitelist entry", async () => {
    const c = ctx();
    const state = { ...baseState(), whitelist: [{ targetId: "u5", type: "user" }] };
    await handleAntinukeComponent(
      { customId: "an:wl:remove:o1", values: ["u5"], user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.removeWhitelist).toHaveBeenCalledWith("g1", "u5");
    expect(state.whitelist).toEqual([]);
  });

  it("rejects a non-owner trying to add to the whitelist", async () => {
    const c = ctx();
    const state = baseState(); // serverOwnerId "o1"
    const reply = vi.fn(async () => {});
    const dir = await handleAntinukeComponent(
      { customId: "an:wl:add:admin", values: ["u5"], roles: { has: () => false }, user: { id: "admin" }, reply },
      state,
      c,
      render,
    );
    expect(dir).toBe("handled");
    expect(reply).toHaveBeenCalled();
    expect(c.config.addWhitelist).not.toHaveBeenCalled();
    expect(state.whitelist).toEqual([]);
  });

  it("rejects a non-owner trying to remove from the whitelist", async () => {
    const c = ctx();
    const state = { ...baseState(), whitelist: [{ targetId: "u5", type: "user" }] };
    const reply = vi.fn(async () => {});
    const dir = await handleAntinukeComponent(
      { customId: "an:wl:remove:admin", values: ["u5"], user: { id: "admin" }, reply },
      state,
      c,
      render,
    );
    expect(dir).toBe("handled");
    expect(reply).toHaveBeenCalled();
    expect(c.config.removeWhitelist).not.toHaveBeenCalled();
    expect(state.whitelist).toEqual([{ targetId: "u5", type: "user" }]);
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleAntinukeComponent(
      { customId: "an:close:o1", user: { id: "o1" } },
      baseState(),
      ctx(),
      render,
    );
    expect(dir).toBe("close");
  });

  it("persists valid advanced-modal numbers and updates the panel", async () => {
    const c = ctx();
    const state = baseState();
    const sub = {
      fields: { getTextInputValue: (k) => (k === "raidJoinCount" ? "8" : "15") },
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };
    const i = {
      customId: "an:adv:o1",
      user: { id: "o1" },
      showModal: vi.fn(async () => {}),
      awaitModalSubmit: vi.fn(async () => sub),
    };
    const dir = await handleAntinukeComponent(i, state, c, render);
    expect(i.showModal).toHaveBeenCalled();
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { raidJoinCount: 8, raidWindowSec: 15 });
    expect(sub.update).toHaveBeenCalled();
    expect(dir).toBe("handled");
  });

  it("rejects invalid advanced-modal input without persisting", async () => {
    const c = ctx();
    const sub = {
      fields: { getTextInputValue: () => "abc" },
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };
    const i = {
      customId: "an:adv:o1",
      user: { id: "o1" },
      showModal: vi.fn(async () => {}),
      awaitModalSubmit: vi.fn(async () => sub),
    };
    const dir = await handleAntinukeComponent(i, baseState(), c, render);
    expect(c.config.updateAntinuke).not.toHaveBeenCalled();
    expect(sub.reply).toHaveBeenCalled();
    expect(dir).toBe("handled");
  });

  it("returns 'handled' when modal times out or is dismissed without persisting", async () => {
    const c = ctx();
    const state = baseState();
    const i = {
      customId: "an:adv:o1",
      user: { id: "o1" },
      showModal: vi.fn(async () => {}),
      awaitModalSubmit: vi.fn(async () => { throw new Error("timeout"); }),
    };
    const dir = await handleAntinukeComponent(i, state, c, render);
    expect(dir).toBe("handled");
    expect(c.config.updateAntinuke).not.toHaveBeenCalled();
  });

  it("sets quarantineRoleId from a role select", async () => {
    const c = ctx();
    const state = baseState();
    await handleAntinukeComponent(
      { customId: "an:sel:qrole:o1", values: ["r9"], user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { quarantineRoleId: "r9" });
    expect(state.antinuke.quarantineRoleId).toBe("r9");
  });
});

describe("handleAntinukeComponent — whitelist limits", () => {
  const render = () => ({ embeds: [], components: [] });
  const wlState = (over = {}) => ({
    guildId: "g1",
    ownerId: "o1",
    view: "main",
    wlAction: null,
    antinuke: { whitelistLimitEnabled: false, whitelistLimits: {} },
    ...over,
  });

  it("opens and closes the whitelist-limits sub-view, resetting the picked action", async () => {
    const s = wlState();
    await handleAntinukeComponent({ customId: "an:wll:open:o1", user: { id: "o1" } }, s, ctx(), render);
    expect(s.view).toBe("wllimits");
    s.wlAction = "ban";
    await handleAntinukeComponent({ customId: "an:wll:back:o1", user: { id: "o1" } }, s, ctx(), render);
    expect(s.view).toBe("main");
    expect(s.wlAction).toBeNull();
  });

  it("toggles the master feature flag", async () => {
    const c = ctx();
    const s = wlState();
    await handleAntinukeComponent({ customId: "an:wll:toggle:o1", user: { id: "o1" } }, s, c, render);
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { whitelistLimitEnabled: true });
    expect(s.antinuke.whitelistLimitEnabled).toBe(true);
  });

  it("picks an action to configure", async () => {
    const s = wlState();
    await handleAntinukeComponent(
      { customId: "an:wll:pick:o1", values: ["kick"], user: { id: "o1" } },
      s,
      ctx(),
      render,
    );
    expect(s.wlAction).toBe("kick");
  });

  it("sets the limit for the picked action, merging defaults", async () => {
    const c = ctx();
    const s = wlState({ wlAction: "ban" });
    await handleAntinukeComponent(
      { customId: "an:wll:limit:o1", values: ["5"], user: { id: "o1" } },
      s,
      c,
      render,
    );
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", {
      whitelistLimits: { ban: { enabled: false, limit: 5, windowSec: 30 } },
    });
    expect(s.antinuke.whitelistLimits.ban.limit).toBe(5);
  });

  it("sets the window and toggles the per-action enabled flag", async () => {
    const c = ctx();
    const s = wlState({ wlAction: "ban" });
    await handleAntinukeComponent(
      { customId: "an:wll:window:o1", values: ["40"], user: { id: "o1" } },
      s,
      c,
      render,
    );
    expect(s.antinuke.whitelistLimits.ban.windowSec).toBe(40);
    await handleAntinukeComponent({ customId: "an:wll:actog:o1", user: { id: "o1" } }, s, c, render);
    expect(s.antinuke.whitelistLimits.ban.enabled).toBe(true);
  });

  it("ignores limit/window/actog when no action is selected", async () => {
    const c = ctx();
    const s = wlState({ wlAction: null });
    await handleAntinukeComponent(
      { customId: "an:wll:limit:o1", values: ["5"], user: { id: "o1" } },
      s,
      c,
      render,
    );
    expect(c.config.updateAntinuke).not.toHaveBeenCalled();
  });
});
