import { describe, it, expect } from "vitest";
import { Budget } from "../../../src/modules/automod/budget.js";

describe("Budget", () => {
  it("tracks elapsed against the per-message ceiling", () => {
    let t = 0;
    const b = new Budget({ perMessageMs: 25, now: () => t });
    t = 10;
    expect(b.overBudget()).toBe(false);
    t = 30;
    expect(b.overBudget()).toBe(true);
  });
  it("timeRule reports elapsed and flags per-rule overage", () => {
    let t = 0;
    const b = new Budget({ perRuleMs: 5, now: () => t });
    const { result, ms, over } = b.timeRule(() => { t = 8; return "x"; });
    expect(result).toBe("x");
    expect(ms).toBe(8);
    expect(over).toBe(true);
  });
});
