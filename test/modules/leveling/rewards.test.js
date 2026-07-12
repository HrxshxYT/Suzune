import { describe, it, expect } from "vitest";
import { resolveRewards } from "../../../src/modules/leveling/rewards.js";

const rewards = [
  { level: 5, roleId: "r5" },
  { level: 10, roleId: "r10" },
  { level: 20, roleId: "r20" },
];

describe("resolveRewards (highest-only)", () => {
  it("adds the highest earned tier and removes lower tiers held", () => {
    const out = resolveRewards({ level: 12, rewards, currentRoleIds: ["r5", "other"] });
    expect(out.add).toEqual(["r10"]);
    expect(out.remove).toEqual(["r5"]);
  });
  it("adds nothing new when the correct tier is already held", () => {
    const out = resolveRewards({ level: 12, rewards, currentRoleIds: ["r10"] });
    expect(out.add).toEqual([]);
    expect(out.remove).toEqual([]);
  });
  it("returns empty when no tier is earned yet", () => {
    const out = resolveRewards({ level: 3, rewards, currentRoleIds: [] });
    expect(out.add).toEqual([]);
    expect(out.remove).toEqual([]);
  });
  it("removes a now-too-low tier the member still holds", () => {
    const out = resolveRewards({ level: 25, rewards, currentRoleIds: ["r5", "r10", "r20"] });
    expect(out.add).toEqual([]);
    expect(out.remove).toEqual(["r5", "r10"]);
  });
});
