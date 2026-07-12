import { describe, it, expect } from "vitest";
import { buildRankCard } from "../../../src/modules/leveling/card.js";

describe("buildRankCard", () => {
  it("renders a non-empty PNG buffer", async () => {
    const buf = await buildRankCard({
      username: "tester",
      avatarPng: null,
      level: 3,
      rank: 7,
      xpIntoLevel: 40,
      xpForNext: 200,
      percent: 0.2,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG"); // PNG signature
  });
});
