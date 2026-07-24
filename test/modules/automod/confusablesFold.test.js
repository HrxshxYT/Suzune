import { describe, it, expect } from "vitest";
import { fold } from "../../../src/modules/automod/confusables/fold.js";

describe("fold", () => {
  it("maps Cyrillic homoglyphs to Latin", () => {
    // а о е р are Cyrillic here
    expect(fold("dата")).toContain("a"); // best-effort per table
  });
  it("passes plain ASCII through unchanged", () => {
    expect(fold("discord")).toBe("discord");
  });
  it("handles empty and returns a string", () => {
    expect(fold("")).toBe("");
  });
});
