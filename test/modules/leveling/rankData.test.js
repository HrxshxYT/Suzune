import { describe, it, expect } from "vitest";
import { buildRankData } from "../../../src/modules/leveling/rankData.js";

describe("buildRankData", () => {
  it("derives level/progress from xp and passes rank through", () => {
    const d = buildRankData({ xp: 150, rank: 4 });
    expect(d.level).toBe(1);
    expect(d.rank).toBe(4);
    expect(d.xp).toBe(150);
    expect(d.xpIntoLevel).toBe(50);
    expect(d.xpForNext).toBe(155);
    expect(d.percent).toBeCloseTo(50 / 155, 5);
  });
});
