import { describe, it, expect } from "vitest";
import { evaluateMessage, isExempt } from "../../../src/modules/automod/evaluate.js";
import { PermissionFlagsBits } from "discord.js";

const baseConfig = {
  antiSpam: true,
  spamCount: 5,
  antiMentionSpam: true,
  mentionLimit: 5,
  filterInvites: true,
  filterLinks: false,
  antiCaps: true,
  capsPercent: 70,
  capsMinLength: 8,
  antiEmojiSpam: true,
  emojiLimit: 4,
};
const msg = (over = {}) => ({
  content: "",
  mentions: { users: new Map(), roles: new Map() },
  ...over,
});

describe("evaluateMessage", () => {
  it("trips on spam when count reaches the limit", () => {
    expect(evaluateMessage({ message: msg(), config: baseConfig, spamCount: 5 }).reason).toBe("spam");
  });
  it("trips on an invite link", () => {
    const r = evaluateMessage({
      message: msg({ content: "discord.gg/xyz" }),
      config: baseConfig,
      spamCount: 0,
    });
    expect(r.tripped).toBe(true);
    expect(r.reason).toMatch(/invite/);
  });
  it("does not trip a clean message", () => {
    expect(
      evaluateMessage({ message: msg({ content: "hello there" }), config: baseConfig, spamCount: 1 })
        .tripped,
    ).toBe(false);
  });
  it("respects disabled rules", () => {
    const cfg = { ...baseConfig, filterInvites: false };
    expect(
      evaluateMessage({ message: msg({ content: "discord.gg/xyz" }), config: cfg, spamCount: 0 })
        .tripped,
    ).toBe(false);
  });
});

describe("isExempt", () => {
  const member = (perms = [], roleIds = []) => ({
    permissions: { has: (p) => perms.includes(p) },
    roles: { cache: new Map(roleIds.map((r) => [r, { id: r }])) },
  });
  it("exempts Manage Messages holders", () => {
    expect(
      isExempt({ member: member([PermissionFlagsBits.ManageMessages]), channelId: "c1", config: {} }),
    ).toBe(true);
  });
  it("exempts configured roles and channels", () => {
    expect(isExempt({ member: member([], ["r1"]), channelId: "c1", config: { exemptRoles: ["r1"] } })).toBe(true);
    expect(isExempt({ member: member(), channelId: "c1", config: { exemptChannels: ["c1"] } })).toBe(true);
  });
  it("does not exempt a normal member", () => {
    expect(
      isExempt({ member: member(), channelId: "c9", config: { exemptRoles: [], exemptChannels: [] } }),
    ).toBe(false);
  });
});
