import { describe, it, expect } from "vitest";
import { PACKS, getPack, updateAvailable } from "../../../src/modules/automod/rules/packs/index.js";
import { validatePattern } from "../../../src/modules/automod/rules/validate.js";

describe("packs", () => {
  it("every pack has an id, integer version, and rules", () => {
    for (const p of PACKS) {
      expect(typeof p.id).toBe("string");
      expect(Number.isInteger(p.version)).toBe(true);
      expect(p.rules.length).toBeGreaterThan(0);
    }
  });
  it("every pack rule pattern compiles under re2", () => {
    for (const p of PACKS)
      for (const r of p.rules) expect(validatePattern(r.pattern).ok, `${p.id}:${r.pattern}`).toBe(true);
  });
  it("getPack finds by id", () => {
    expect(getPack("nitro")?.id).toBe("nitro");
  });
  it("updateAvailable compares versions", () => {
    expect(updateAvailable({ installedVersion: 0 }, { version: 1 })).toBe(true);
    expect(updateAvailable({ installedVersion: 1 }, { version: 1 })).toBe(false);
  });
  it("includes the built-in core pack", () => {
    expect(getPack("core")).toBeDefined();
  });
});
