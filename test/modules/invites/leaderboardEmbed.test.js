import { describe, it, expect } from "vitest";
import { buildLeaderboardEmbed } from "../../../src/modules/invites/leaderboardEmbed.js";

describe("buildLeaderboardEmbed", () => {
  it("ranks entries by their global position across pages", () => {
    const page0 = buildLeaderboardEmbed([{ userId: "a", count: 9 }], 0, 10).toJSON();
    expect(page0.description).toContain("**1.** <@a> — 9");

    const page1 = buildLeaderboardEmbed([{ userId: "z", count: 3 }], 1, 10).toJSON();
    expect(page1.description).toContain("**11.** <@z> — 3"); // page 1, first row → rank 11
  });

  it("shows a placeholder when empty", () => {
    expect(buildLeaderboardEmbed([], 0, 10).toJSON().description).toContain("No invites tracked");
  });
});
