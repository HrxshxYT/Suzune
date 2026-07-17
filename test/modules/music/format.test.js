import { describe, it, expect } from "vitest";
import { formatDuration, progressBar } from "../../../src/modules/music/format.js";

describe("formatDuration", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5000)).toBe("0:05");
    expect(formatDuration(83000)).toBe("1:23");
    expect(formatDuration(600000)).toBe("10:00");
  });

  it("formats hour+ durations as h:mm:ss", () => {
    expect(formatDuration(3661000)).toBe("1:01:01");
  });

  it("labels live/unknown streams", () => {
    expect(formatDuration(0, { live: true })).toBe("🔴 LIVE");
  });

  it("clamps negatives to 0:00", () => {
    expect(formatDuration(-100)).toBe("0:00");
  });
});

describe("progressBar", () => {
  it("renders position, a filled bar with a knob, and duration", () => {
    const bar = progressBar(60000, 120000, 10);
    expect(bar).toContain("1:00");
    expect(bar).toContain("2:00");
    expect(bar).toContain("●");
  });

  it("puts the knob near the start at position 0 and end when complete", () => {
    expect(progressBar(0, 120000, 10).indexOf("●")).toBeLessThan(
      progressBar(120000, 120000, 10).indexOf("●"),
    );
  });

  it("shows a live indicator instead of a bar for streams", () => {
    expect(progressBar(1000, 0, 10, { live: true })).toContain("LIVE");
  });
});
