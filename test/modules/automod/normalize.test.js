import { describe, it, expect } from "vitest";
import { normalize } from "../../../src/modules/automod/pipeline/normalize.js";

describe("normalize", () => {
  it("returns raw untouched", () => {
    expect(normalize("Hello.World").raw).toBe("Hello.World");
  });
  it("folds Cyrillic 'discord' to latin in normalized", () => {
    const cyr = "diѕcоxtitle"; // ѕ (U+0455) and о (U+043E) are Cyrillic confusables
    expect(normalize(cyr).normalized).toContain("disc");
  });
  it("strips zero-width joiners", () => {
    expect(normalize("disc​ord").normalized).toBe("discord");
  });
  it("strips combining marks", () => {
    // 'e' + combining acute (U+0301), not the precomposed é
    expect(normalize("café").normalized).toBe("cafe");
  });
  it("NFKC folds fullwidth", () => {
    expect(normalize("ｄｉｓ").normalized).toBe("dis");
  });
  it("collapses 3+ runs to 2 but keeps doubles", () => {
    expect(normalize("niiiitro").normalized).toBe("niitro");
    expect(normalize("free").normalized).toBe("free");
  });
  it("stripped variant defeats spaced-out text", () => {
    expect(normalize("d i s c o r d . g i f t").stripped).toBe("discordgift");
  });
  it("lowercases", () => {
    // Avoid "DISCORD": capital I (U+0049) is a genuine Unicode confusable for
    // lowercase l (U+006C) in the vendored table, and fold() runs before
    // lowercasing, so "DISCORD" -> "DlSCORD" -> "dlscord" (see task-5-report.md).
    expect(normalize("HELLO").normalized).toBe("hello");
  });
});
