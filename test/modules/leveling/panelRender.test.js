import { describe, it, expect } from "vitest";
import { buildMainView, buildRewardsView } from "../../../src/modules/leveling/panel/render.js";

const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  view: "main",
  leveling: { enabled: true, announce: true, xpMin: 15, xpMax: 25, cooldownSec: 60, ignoredChannels: [], ignoredRoles: [] },
  rewards: [{ level: 5, roleId: "r5" }],
  pendingRoleId: null,
  ...over,
});

describe("buildMainView", () => {
  it("exposes the toggle/xp/rewards/close controls", () => {
    const ids = buildMainView(state()).components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("lv:tog:enabled:o1");
    expect(ids).toContain("lv:tog:announce:o1");
    expect(ids).toContain("lv:xp:o1");
    expect(ids).toContain("lv:rewards:o1");
    expect(ids).toContain("lv:ign:channels:o1");
    expect(ids).toContain("lv:ign:roles:o1");
    expect(ids).toContain("lv:close:o1");
  });

  it("shows the enabled toggle green (Success=3) when on", () => {
    const btn = buildMainView(state()).components[0].components[0];
    expect(btn.data.style).toBe(3);
  });
});

describe("buildRewardsView", () => {
  it("offers role/level/remove selects and back/close", () => {
    const ids = buildRewardsView(state({ view: "rewards" })).components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("lv:rw:role:o1");
    expect(ids).toContain("lv:rw:level:o1");
    expect(ids).toContain("lv:rw:remove:o1");
    expect(ids).toContain("lv:back:o1");
  });

  it("omits the remove select when there are no rewards", () => {
    const ids = buildRewardsView(state({ view: "rewards", rewards: [] })).components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).not.toContain("lv:rw:remove:o1");
  });
});
