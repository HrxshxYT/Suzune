import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { computeMetrics, integrityTier } from "../../../src/modules/dashboard/metrics.js";

// Minimal fake for a PermissionsBitField: exposes only the .has() the metrics
// code relies on.
function perms(...bits) {
  const set = new Set(bits.map((b) => b.toString()));
  return { has: (bit) => set.has(bit.toString()) };
}

function collection(entries) {
  const cache = new Map(entries.map((e) => [e.id, e]));
  return { cache };
}

function guild(overrides = {}) {
  return {
    id: "g1",
    ownerId: "owner",
    memberCount: 100,
    roles: collection([
      { id: "g1", permissions: perms() }, // @everyone, no dangerous perms
      { id: "r-admin", permissions: perms(PermissionFlagsBits.Administrator), managed: false },
      { id: "r-bot", permissions: perms(PermissionFlagsBits.Administrator), managed: true },
      { id: "r-plain", permissions: perms(), managed: false },
    ]),
    channels: { cache: new Map([["c1", {}], ["c2", {}]]) },
    members: collection([
      { id: "owner", permissions: perms(PermissionFlagsBits.Administrator), user: { bot: false } },
      { id: "u2", permissions: perms(PermissionFlagsBits.Administrator), user: { bot: false } },
      { id: "bot1", permissions: perms(PermissionFlagsBits.Administrator), user: { bot: true } },
    ]),
    ...overrides,
  };
}

const secureConfig = {
  antinuke: { enabled: true, antiRaidEnabled: true, autoRevert: true },
  automod: { enabled: true },
  whitelist: [],
  modLogEnabled: true,
};

describe("computeMetrics", () => {
  it("counts roles, admins and threat roles", () => {
    const m = computeMetrics({ guild: guild(), config: secureConfig });
    expect(m.roles).toBe(3); // excludes @everyone
    expect(m.adminRoles).toBe(2); // r-admin + r-bot
    expect(m.threatRoles).toBe(1); // only the unmanaged, non-whitelisted admin role
  });

  it("separates human admins, threat users and integrations", () => {
    const m = computeMetrics({ guild: guild(), config: secureConfig });
    expect(m.privileged).toBe(2); // owner + u2 (bot excluded)
    expect(m.threatUsers).toBe(1); // u2 (owner is always trusted)
    expect(m.integrations).toBe(1); // bot1
    expect(m.members).toBe(100);
    expect(m.channels).toBe(2);
  });

  it("scores a fully hardened server at 100% and PROTECTED", () => {
    const m = computeMetrics({ guild: guild(), config: secureConfig });
    // one threat role (-5) and one threat user (-3) pull it below 100
    expect(m.integrity).toBe(92);
    expect(m.tier.label).toBe("PROTECTED");
    expect(m.firewall).toBe(true);
  });

  it("penalises disabled protections", () => {
    const m = computeMetrics({
      guild: guild(),
      config: { antinuke: { enabled: false }, automod: { enabled: false }, whitelist: [] },
    });
    expect(m.integrity).toBeLessThan(50);
    expect(m.firewall).toBe(false);
    expect(m.features["Anti-Nuke"]).toBe(false);
  });

  it("flags dangerous @everyone permissions as perm risk", () => {
    const g = guild({
      roles: collection([
        { id: "g1", permissions: perms(PermissionFlagsBits.Administrator, PermissionFlagsBits.BanMembers) },
      ]),
    });
    const m = computeMetrics({ guild: g, config: secureConfig });
    expect(m.permRisk).toBe(2);
  });

  it("respects the whitelist for roles and users", () => {
    const config = {
      ...secureConfig,
      whitelist: [
        { type: "role", targetId: "r-admin" },
        { type: "user", targetId: "u2" },
      ],
    };
    const m = computeMetrics({ guild: guild(), config });
    expect(m.threatRoles).toBe(0);
    expect(m.threatUsers).toBe(0);
  });

  it("counts webhooks as assets and unaccountable ones as threats", () => {
    const webhooks = [
      { id: "w1", owner: { id: "bot1", bot: true } }, // trusted bot-owned
      { id: "w2", owner: { id: "u2", bot: false } }, // human-owned, not whitelisted
      { id: "w3", owner: null }, // ownerless
    ];
    const m = computeMetrics({ guild: guild(), config: secureConfig, webhooks });
    expect(m.totalAssets).toBe(3);
    expect(m.threatAssets).toBe(2);
  });
});

describe("integrityTier", () => {
  it("maps scores to tiers", () => {
    expect(integrityTier(95).label).toBe("PROTECTED");
    expect(integrityTier(75).label).toBe("GUARDED");
    expect(integrityTier(50).label).toBe("ELEVATED");
    expect(integrityTier(10).label).toBe("AT RISK");
  });
});
