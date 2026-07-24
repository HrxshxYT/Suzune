import { describe, it, expect } from "vitest";
import { parseConfusablesLine, buildMap } from "../../scripts/build-confusables.js";

describe("build-confusables parser", () => {
  it("parses a single-source mapping line", () => {
    // "0430 ; 0061 ; MA  # ( а → a )"
    const row = parseConfusablesLine("0430 ; 0061 ; MA\t#\t( а → a )");
    expect(row).toEqual({ source: "а", target: "a" });
  });
  it("skips comments and blank lines", () => {
    expect(parseConfusablesLine("# comment")).toBeNull();
    expect(parseConfusablesLine("")).toBeNull();
  });
  it("skips multi-codepoint sources (out of scope)", () => {
    expect(parseConfusablesLine("00DF ; 0073 0073 ; MA")).toEqual({
      source: "ß",
      target: "ss",
    });
  });
  it("buildMap dedupes to a Map", () => {
    const map = buildMap(["0430 ; 0061 ; MA", "0435 ; 0065 ; MA"]);
    expect(map.get("а")).toBe("a");
    expect(map.get("е")).toBe("e");
  });
});
