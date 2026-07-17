import { describe, it, expect } from "vitest";
import {
  buildHelpDetailEmbed,
  categoryNames,
  categoryCounts,
  commandsInCategory,
} from "../../../src/modules/util/help.js";

function commandsMap() {
  return new Map([
    ["ban", { data: { name: "ban", description: "Ban a user" }, category: "moderation", permissions: [1] }],
    ["kick", { data: { name: "kick", description: "Kick a user" }, category: "moderation", permissions: [1] }],
    ["ping", { data: { name: "ping", description: "Latency" }, category: "util", permissions: [] }],
  ]);
}

describe("help helpers", () => {
  it("categoryNames returns sorted unique categories", () => {
    expect(categoryNames(commandsMap())).toEqual(["moderation", "util"]);
  });

  it("categoryCounts returns per-category counts sorted by name", () => {
    expect(categoryCounts(commandsMap())).toEqual([
      { name: "moderation", count: 2 },
      { name: "util", count: 1 },
    ]);
  });

  it("commandsInCategory returns that category's command names sorted", () => {
    expect(commandsInCategory(commandsMap(), "moderation")).toEqual(["ban", "kick"]);
    expect(commandsInCategory(commandsMap(), "util")).toEqual(["ping"]);
  });

  it("commandsInCategory returns empty for an unknown category", () => {
    expect(commandsInCategory(commandsMap(), "nope")).toEqual([]);
  });

  it("detail shows description and permission note", () => {
    const e = buildHelpDetailEmbed({
      data: { name: "ban", description: "Ban a user" },
      category: "moderation",
      permissions: [1],
    });
    const s = JSON.stringify(e.data);
    expect(s).toContain("Ban a user");
    expect(s).toContain("moderation");
  });
});
