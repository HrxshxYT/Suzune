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
});
