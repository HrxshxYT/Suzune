import { describe, it, expect } from "vitest";
import { xpForLevel, levelForXp, progress } from "../../../src/modules/leveling/curve.js";

describe("xp curve", () => {
  it("xpForLevel is cumulative and starts at 0", () => {
    // cost(0)=100, cost(1)=155, cost(2)=220
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(255); // 100 + 155
    expect(xpForLevel(3)).toBe(475); // 255 + 220
  });

  it("levelForXp is the inverse (highest threshold <= xp)", () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(99)).toBe(0);
    expect(levelForXp(100)).toBe(1);
    expect(levelForXp(254)).toBe(1);
    expect(levelForXp(255)).toBe(2);
  });

  it("progress reports position within the current level", () => {
    const p = progress(150);
    expect(p.level).toBe(1);
    expect(p.xpIntoLevel).toBe(50);   // 150 - xpForLevel(1)=100
    expect(p.xpForNext).toBe(155);    // cost(1)
    expect(p.percent).toBeCloseTo(50 / 155, 5);
  });
});
