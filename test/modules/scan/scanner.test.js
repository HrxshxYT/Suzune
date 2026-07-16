import { describe, it, expect } from "vitest";
import { PermissionFlagsBits, GuildVerificationLevel } from "discord.js";
import { scanGuild } from "../../../src/modules/scan/scanner.js";

function perms(...bits) {
  const set = new Set(bits.map((b) => b.toString()));
  return { has: (bit) => set.has(bit.toString()) };
}
function collection(entries) {
  return { cache: new Map(entries.map((e) => [e.id, e])) };
}

// A hardened server: all protections on, no dangerous perms, bot on top.
function secureGuild() {
  return {
    id: "g1",
    ownerId: "owner",
    memberCount: 100,
    verificationLevel: GuildVerificationLevel.High,
    mfaLevel: 1,
    roles: collection([
      { id: "g1", position: 0, permissions: perms() },
      { id: "mod", name: "Mod", position: 2, managed: false, permissions: perms(PermissionFlagsBits.KickMembers) },
    ]),
    channels: { cache: new Map([["c1", {}]]) },
    members: collection([
      { id: "owner", permissions: perms(PermissionFlagsBits.Administrator), user: { bot: false } },
    ]),
  };
}
const secureConfig = {
  antinuke: { enabled: true, antiRaidEnabled: true, autoRevert: true, alertChannelId: "a1" },
  automod: { enabled: true },
  whitelist: [],
  modLogEnabled: true,
};
const secureBot = { permissions: perms(...[
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ModerateMembers,
]), roles: { highest: { position: 50 } } };

describe("scanGuild — secure server", () => {
  it("grades a hardened server highly with no critical findings", () => {
    const report = scanGuild({ guild: secureGuild(), config: secureConfig, botMember: secureBot });
    expect(report.counts.critical).toBe(0);
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.grade === "A" || report.grade === "A+").toBe(true);
    expect(report.tier.label).toBe("PROTECTED");
    expect(report.recommendations[0].label).toMatch(/keep it up/i);
  });
});

describe("scanGuild — risky server", () => {
  const riskyGuild = () => ({
    id: "g1",
    ownerId: "owner",
    memberCount: 2000,
    verificationLevel: GuildVerificationLevel.None,
    mfaLevel: 0,
    roles: collection([
      { id: "g1", position: 0, permissions: perms(PermissionFlagsBits.Administrator) }, // @everyone admin!
      { id: "staff", name: "Staff", position: 9, managed: false, permissions: perms(PermissionFlagsBits.Administrator) },
      { id: "old", name: "OldMod", position: 11, managed: false, permissions: perms(PermissionFlagsBits.BanMembers) },
    ]),
    channels: { cache: new Map([["c1", {}]]) },
    members: collection([
      { id: "owner", permissions: perms(PermissionFlagsBits.Administrator), user: { bot: false } },
      { id: "u2", permissions: perms(PermissionFlagsBits.Administrator), user: { bot: false } },
      { id: "u3", permissions: perms(PermissionFlagsBits.Administrator), user: { bot: false } },
      { id: "u4", permissions: perms(PermissionFlagsBits.Administrator), user: { bot: false } },
    ]),
  });
  const riskyConfig = { antinuke: { enabled: false }, automod: { enabled: false }, whitelist: [], modLogEnabled: false };
  const weakBot = { permissions: perms(PermissionFlagsBits.KickMembers), roles: { highest: { position: 10 } } };

  it("flags critical issues and drops the grade", () => {
    const report = scanGuild({ guild: riskyGuild(), config: riskyConfig, botMember: weakBot });
    expect(report.counts.critical).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(50);
    expect(report.grade).toBe("F");
    const titles = report.findings.map((f) => f.title).join(" | ");
    expect(titles).toMatch(/Anti-Nuke is disabled/);
    expect(titles).toMatch(/@everyone holds dangerous permissions/);
    expect(titles).toMatch(/missing key permissions/);
  });

  it("detects broken (above-the-bot) privileged roles", () => {
    const report = scanGuild({ guild: riskyGuild(), config: riskyConfig, botMember: weakBot });
    expect(report.brokenRoles).toBeGreaterThan(0);
    expect(report.findings.some((f) => /rank above the bot/.test(f.title))).toBe(true);
  });

  it("recommends enabling the disabled protections", () => {
    const report = scanGuild({ guild: riskyGuild(), config: riskyConfig, botMember: weakBot });
    const labels = report.recommendations.map((r) => r.label).join(" | ");
    expect(labels).toMatch(/Enable Anti-Nuke/);
    expect(labels).toMatch(/Anti-Raid/);
    expect(labels).toMatch(/Auto-Moderation/);
  });

  it("orders findings critical → warning → info", () => {
    const report = scanGuild({ guild: riskyGuild(), config: riskyConfig, botMember: weakBot });
    const order = { critical: 0, warning: 1, info: 2 };
    const seq = report.findings.map((f) => order[f.severity]);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
  });
});
