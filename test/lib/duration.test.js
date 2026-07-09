import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration } from "../../src/lib/duration.js";

describe("parseDuration", () => {
  it("parses single units", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("7d")).toBe(604_800_000);
    expect(parseDuration("1w")).toBe(604_800_000);
  });

  it("parses concatenated units", () => {
    expect(parseDuration("1h30m")).toBe(5_400_000);
  });

  it("returns null for invalid input", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("10x")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats milliseconds into compact units", () => {
    expect(formatDuration(5_400_000)).toBe("1h 30m");
    expect(formatDuration(30_000)).toBe("30s");
  });
});
