import { describe, it, expect } from "vitest";
import { RE2 } from "re2-wasm";

describe("re2-wasm", () => {
  it("compiles and matches linearly", () => {
    const re = new RE2("disc(o|0)rd", "iu");
    expect(re.test("DISC0RD")).toBe(true);
    expect(re.test("hello")).toBe(false);
  });
  it("rejects lookahead (documents the limitation)", () => {
    expect(() => new RE2("foo(?=bar)", "u")).toThrow();
  });
});
