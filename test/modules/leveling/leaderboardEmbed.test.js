import { describe, it, expect } from "vitest";
import { buildLevelLeaderboardEmbed } from "../../../src/modules/leveling/leaderboardEmbed.js";

describe("buildLevelLeaderboardEmbed", () => {
  it("numbers entries by page offset and shows level + xp", () => {
    const entries = [
      { userId: "u1", xp: 300 },
      { userId: "u2", xp: 100 },
    ];
    const embed = buildLevelLeaderboardEmbed(entries, 0, 10);
    const json = JSON.stringify(embed.data);
    expect(json).toContain("#1");
    expect(json).toContain("<@u1>");
    expect(json).toContain("300");
  });

  it("continues numbering on later pages", () => {
    const embed = buildLevelLeaderboardEmbed([{ userId: "u11", xp: 5 }], 1, 10);
    expect(JSON.stringify(embed.data)).toContain("#11");
  });

  it("renders an empty-state description when there are no entries", () => {
    const embed = buildLevelLeaderboardEmbed([], 0, 10);
    expect(JSON.stringify(embed.data)).toContain("No one has earned XP");
  });
});
