import { describe, it, expect } from "vitest";
import { HeatService } from "../../src/core/HeatService.js";

describe("HeatService", () => {
  it("accumulates heat", () => {
    let t = 0;
    const h = new HeatService(() => t);
    expect(h.add("g", "u", 30, 60000)).toBe(30);
    expect(h.add("g", "u", 40, 60000)).toBe(70);
  });
  it("decays by half over one half-life", () => {
    let t = 0;
    const h = new HeatService(() => t);
    h.add("g", "u", 100, 60000);
    t = 60000;
    expect(h.get("g", "u", 60000)).toBeCloseTo(50, 5);
  });
  it("reset clears", () => {
    let t = 0;
    const h = new HeatService(() => t);
    h.add("g", "u", 100, 60000);
    h.reset("g", "u");
    expect(h.get("g", "u", 60000)).toBe(0);
  });
  it("sweep drops near-zero entries", () => {
    let t = 0;
    const h = new HeatService(() => t);
    h.add("g", "u", 100, 60000);
    t = 600000; // 10 half-lives → ~0.098
    h.sweep(60000, 0.5);
    expect(h.get("g", "u", 60000)).toBe(0);
  });
});
