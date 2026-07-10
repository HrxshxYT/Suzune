import { describe, it, expect } from "vitest";
import { memberDiff, messageDelete, memberJoin } from "../../../src/modules/audit/format.js";
import { CATEGORY_KEYS } from "../../../src/modules/audit/categories.js";
import { COLORS } from "../../../src/lib/constants.js";

function member(over = {}) {
  return {
    id: "u1",
    nickname: null,
    roles: { cache: new Map() },
    communicationDisabledUntilTimestamp: null,
    user: { tag: "A#1", displayAvatarURL: () => "http://a/x.png" },
    ...over,
  };
}

describe("categories", () => {
  it("covers the core systems", () => {
    for (const k of ["members", "memberEdits", "messages", "channels", "roles", "voice"]) {
      expect(CATEGORY_KEYS).toContain(k);
    }
  });
});

describe("memberDiff", () => {
  it("returns null when nothing relevant changed", () => {
    expect(memberDiff(member(), member())).toBeNull();
  });
  it("reports a nickname change", () => {
    const e = memberDiff(member(), member({ nickname: "New" }));
    expect(e.toJSON().description).toContain("Nickname");
    expect(e.toJSON().color).toBe(COLORS.brand);
  });
  it("reports added roles", () => {
    const after = member({ roles: { cache: new Map([["r1", {}]]) } });
    expect(memberDiff(member(), after).toJSON().description).toContain("<@&r1>");
  });
  it("reports timeouts", () => {
    const after = member({ communicationDisabledUntilTimestamp: Date.now() + 1000 });
    expect(memberDiff(member(), after).toJSON().description).toContain("Timed out");
  });
});

describe("messageDelete / memberJoin", () => {
  it("messageDelete includes author and content", () => {
    const e = messageDelete({ author: { id: "a" }, channelId: "c", content: "hi there" }).toJSON();
    expect(e.description).toContain("<@a>");
    expect(e.description).toContain("hi there");
  });
  it("memberJoin references the member", () => {
    expect(memberJoin(member()).toJSON().description).toContain("<@u1>");
  });
});
