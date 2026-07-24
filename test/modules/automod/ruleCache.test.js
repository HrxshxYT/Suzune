import { describe, it, expect, vi } from "vitest";
import { RuleCache } from "../../../src/modules/automod/rules/cache.js";

describe("RuleCache", () => {
  it("compiles and caches, skipping invalid rules", () => {
    const logger = { warn: vi.fn() };
    const cache = new RuleCache(logger);
    const compiled = cache.set("g", [
      { pattern: "good", target: "any", weight: 10 },
      { pattern: "foo(?=bar)", target: "any", weight: 10 }, // invalid under re2
    ]);
    expect(compiled).toHaveLength(1);
    expect(cache.get("g")).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
  it("invalidate clears", () => {
    const cache = new RuleCache({ warn: () => {} });
    cache.set("g", [{ pattern: "x", target: "any", weight: 1 }]);
    cache.invalidate("g");
    expect(cache.get("g")).toBeUndefined();
  });
});
