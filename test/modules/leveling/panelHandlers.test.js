import { describe, it, expect, vi } from "vitest";
import { handleLevelingComponent } from "../../../src/modules/leveling/panel/handlers.js";

const ctx = () => ({
  config: { updateLeveling: vi.fn(async () => ({})) },
  leveling: {
    addReward: vi.fn(async () => {}),
    removeReward: vi.fn(async () => {}),
    getRewards: vi.fn(async () => [{ level: 5, roleId: "r5" }]),
  },
});

const baseState = () => ({
  guildId: "g1",
  ownerId: "o1",
  view: "main",
  leveling: { enabled: false, announce: true, xpMin: 15, xpMax: 25, cooldownSec: 60, ignoredChannels: [], ignoredRoles: [] },
  rewards: [],
  pendingRoleId: null,
});
const render = () => ({ embeds: [], components: [] });

describe("handleLevelingComponent", () => {
  it("toggles enabled and persists", async () => {
    const c = ctx();
    const s = baseState();
    const dir = await handleLevelingComponent({ customId: "lv:tog:enabled:o1", user: { id: "o1" } }, s, c, render);
    expect(dir).toBe("update");
    expect(c.config.updateLeveling).toHaveBeenCalledWith("g1", { enabled: true });
    expect(s.leveling.enabled).toBe(true);
  });

  it("navigates to the rewards sub-view and back", async () => {
    const s = baseState();
    await handleLevelingComponent({ customId: "lv:rewards:o1", user: { id: "o1" } }, s, ctx(), render);
    expect(s.view).toBe("rewards");
    await handleLevelingComponent({ customId: "lv:back:o1", user: { id: "o1" } }, s, ctx(), render);
    expect(s.view).toBe("main");
  });

  it("persists ignored channels from the channel select", async () => {
    const c = ctx();
    const s = baseState();
    await handleLevelingComponent({ customId: "lv:ign:channels:o1", values: ["c1", "c2"], user: { id: "o1" } }, s, c, render);
    expect(c.config.updateLeveling).toHaveBeenCalledWith("g1", { ignoredChannels: ["c1", "c2"] });
    expect(s.leveling.ignoredChannels).toEqual(["c1", "c2"]);
  });

  it("stores a pending reward role, then adds the reward when a level is picked", async () => {
    const c = ctx();
    const s = { ...baseState(), view: "rewards" };
    await handleLevelingComponent({ customId: "lv:rw:role:o1", values: ["r10"], user: { id: "o1" } }, s, c, render);
    expect(s.pendingRoleId).toBe("r10");
    await handleLevelingComponent({ customId: "lv:rw:level:o1", values: ["10"], user: { id: "o1" } }, s, c, render);
    expect(c.leveling.addReward).toHaveBeenCalledWith("g1", 10, "r10");
    expect(c.leveling.getRewards).toHaveBeenCalledWith("g1");
    expect(s.pendingRoleId).toBeNull();
    expect(s.rewards).toEqual([{ level: 5, roleId: "r5" }]); // refreshed from service
  });

  it("removes a reward from the remove select", async () => {
    const c = ctx();
    const s = { ...baseState(), view: "rewards", rewards: [{ level: 5, roleId: "r5" }] };
    await handleLevelingComponent({ customId: "lv:rw:remove:o1", values: ["5"], user: { id: "o1" } }, s, c, render);
    expect(c.leveling.removeReward).toHaveBeenCalledWith("g1", 5);
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleLevelingComponent({ customId: "lv:close:o1", user: { id: "o1" } }, baseState(), ctx(), render);
    expect(dir).toBe("close");
  });
});
