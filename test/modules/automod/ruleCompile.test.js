// test/modules/automod/ruleCompile.test.js
import { describe, it, expect } from "vitest";
import { validatePattern, MAX_PATTERN_LEN } from "../../../src/modules/automod/rules/validate.js";
import { compileRule } from "../../../src/modules/automod/rules/compile.js";

describe("validatePattern", () => {
  it("accepts a normal pattern", () => {
    const r = validatePattern("free\\s*nitro");
    expect(r.ok).toBe(true);
    expect(r.re.test("free nitro")).toBe(true);
  });
  it("rejects empty", () => {
    expect(validatePattern("").ok).toBe(false);
  });
  it("rejects over-length", () => {
    expect(validatePattern("a".repeat(MAX_PATTERN_LEN + 1)).ok).toBe(false);
  });
  it("rejects match-everything patterns", () => {
    expect(validatePattern(".*").ok).toBe(false);
    expect(validatePattern("a*").ok).toBe(false); // matches empty
  });
  it("rejects lookahead (re2 limitation) with a readable error", () => {
    const r = validatePattern("foo(?=bar)");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalid/i);
  });
});

describe("compileRule", () => {
  it("attaches a compiled matcher", () => {
    const c = compileRule({ pattern: "scam", target: "any", weight: 10 });
    expect(c.re.test("SCAM")).toBe(true);
  });
});
