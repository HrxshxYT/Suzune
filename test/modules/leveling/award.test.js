import { describe, it, expect } from "vitest";
import { shouldAward, randomXp, detectLevelUp } from "../../../src/modules/leveling/award.js";

const cfg = (over = {}) => ({ enabled: true, ignoredChannels: [], ignoredRoles: [], ...over });

describe("shouldAward", () => {
  it("awards a normal human message in an enabled guild", () => {
    expect(shouldAward({ authorBot: false, inGuild: true, config: cfg(), memberRoleIds: ["r1"], channelId: "c1" })).toBe(true);
  });
  it("rejects bots, DMs, and disabled config", () => {
    expect(shouldAward({ authorBot: true, inGuild: true, config: cfg(), memberRoleIds: [], channelId: "c1" })).toBe(false);
    expect(shouldAward({ authorBot: false, inGuild: false, config: cfg(), memberRoleIds: [], channelId: "c1" })).toBe(false);
    expect(shouldAward({ authorBot: false, inGuild: true, config: cfg({ enabled: false }), memberRoleIds: [], channelId: "c1" })).toBe(false);
    expect(shouldAward({ authorBot: false, inGuild: true, config: null, memberRoleIds: [], channelId: "c1" })).toBe(false);
  });
  it("rejects ignored channels and ignored roles", () => {
    expect(shouldAward({ authorBot: false, inGuild: true, config: cfg({ ignoredChannels: ["c1"] }), memberRoleIds: [], channelId: "c1" })).toBe(false);
    expect(shouldAward({ authorBot: false, inGuild: true, config: cfg({ ignoredRoles: ["r9"] }), memberRoleIds: ["r9"], channelId: "c1" })).toBe(false);
  });
});

describe("randomXp", () => {
  it("returns an integer within [min, max]", () => {
    expect(randomXp(15, 25, () => 0)).toBe(15);
    expect(randomXp(15, 25, () => 0.999999)).toBe(25);
    expect(randomXp(15, 25, () => 0.5)).toBe(20);
  });
});

describe("detectLevelUp", () => {
  it("flags a crossing of a level threshold", () => {
    expect(detectLevelUp(99, 100)).toEqual({ leveledUp: true, oldLevel: 0, newLevel: 1 });
    expect(detectLevelUp(100, 120)).toEqual({ leveledUp: false, oldLevel: 1, newLevel: 1 });
  });
});
