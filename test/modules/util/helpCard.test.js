import { describe, it, expect } from "vitest";
import { buildHomeCard, buildCategoryCard } from "../../../src/modules/util/helpCard.js";

const isPng = (buf) => Buffer.isBuffer(buf) && buf.subarray(1, 4).toString("latin1") === "PNG";

describe("buildHomeCard", () => {
  it("renders a non-empty PNG for a normal category list", () => {
    const buf = buildHomeCard({
      botName: "Suzune",
      categories: [
        { name: "moderation", count: 17 },
        { name: "util", count: 6 },
        { name: "tickets", count: 1 },
      ],
    });
    expect(isPng(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("renders without throwing when there are no categories", () => {
    const buf = buildHomeCard({ botName: "Suzune", categories: [] });
    expect(isPng(buf)).toBe(true);
  });

  it("renders many categories without throwing", () => {
    const categories = Array.from({ length: 13 }, (_, i) => ({ name: `cat${i}`, count: i + 1 }));
    expect(isPng(buildHomeCard({ botName: "Suzune", categories }))).toBe(true);
  });
});

describe("buildCategoryCard", () => {
  it("renders a non-empty PNG for a category with commands", () => {
    const buf = buildCategoryCard({
      botName: "Suzune",
      category: "moderation",
      commands: ["ban", "kick", "mute", "warn"],
    });
    expect(isPng(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("renders a category with many commands without throwing", () => {
    const commands = Array.from({ length: 17 }, (_, i) => `command${i}`);
    expect(isPng(buildCategoryCard({ botName: "Suzune", category: "moderation", commands }))).toBe(true);
  });

  it("renders without throwing when the category has no commands", () => {
    const buf = buildCategoryCard({ botName: "Suzune", category: "empty", commands: [] });
    expect(isPng(buf)).toBe(true);
  });
});
