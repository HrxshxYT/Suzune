import { PermissionFlagsBits } from "discord.js";

// Permissions that, granted broadly, put the server at risk. Used to score the
// @everyone role and to flag dangerous custom roles.
const DANGEROUS_PERMS = [
  ["Administrator", PermissionFlagsBits.Administrator],
  ["Manage Server", PermissionFlagsBits.ManageGuild],
  ["Manage Roles", PermissionFlagsBits.ManageRoles],
  ["Manage Channels", PermissionFlagsBits.ManageChannels],
  ["Manage Webhooks", PermissionFlagsBits.ManageWebhooks],
  ["Ban Members", PermissionFlagsBits.BanMembers],
  ["Kick Members", PermissionFlagsBits.KickMembers],
  ["Mention Everyone", PermissionFlagsBits.MentionEveryone],
];

function hasPerm(perms, bit) {
  return Boolean(perms?.has?.(bit));
}

function values(collectionLike) {
  const cache = collectionLike?.cache;
  if (!cache) return [];
  if (typeof cache.values === "function") return [...cache.values()];
  return [];
}

// Maps an integrity score to a human status tier plus an embed colour.
export function integrityTier(score) {
  if (score >= 90) return { label: "PROTECTED", color: 0x2ecc71 };
  if (score >= 70) return { label: "GUARDED", color: 0xf1c40f };
  if (score >= 40) return { label: "ELEVATED", color: 0xe67e22 };
  return { label: "AT RISK", color: 0xed4245 };
}

// Computes every security metric surfaced on the dashboard from cached guild
// state plus the persisted guild config. Pure and side-effect free so it can be
// unit tested with plain fakes; the command layer supplies the live objects.
export function computeMetrics({ guild, config = {}, webhooks = [] } = {}) {
  const antinuke = config.antinuke ?? {};
  const automod = config.automod ?? {};
  const whitelist = config.whitelist ?? [];
  const whitelistRoleIds = new Set(
    whitelist.filter((w) => w.type === "role").map((w) => w.targetId),
  );
  const whitelistUserIds = new Set(
    whitelist.filter((w) => w.type === "user").map((w) => w.targetId),
  );

  const everyoneId = guild.id;
  const allRoles = values(guild.roles);
  const roles = allRoles.filter((r) => r.id !== everyoneId);

  const adminRoles = roles.filter((r) => hasPerm(r.permissions, PermissionFlagsBits.Administrator));
  // Unmanaged admin roles that nobody has vouched for are prime nuke vectors.
  const threatRoles = adminRoles.filter((r) => !r.managed && !whitelistRoleIds.has(r.id));

  const everyoneRole = allRoles.find((r) => r.id === everyoneId);
  const permRisk = everyoneRole
    ? DANGEROUS_PERMS.filter(([, bit]) => hasPerm(everyoneRole.permissions, bit)).length
    : 0;

  const channels = guild.channels?.cache?.size ?? 0;

  const members = values(guild.members);
  const humanAdmins = members.filter(
    (m) => !m.user?.bot && hasPerm(m.permissions, PermissionFlagsBits.Administrator),
  );
  const privileged = humanAdmins.length;
  // Admins we have no trust record for (the owner is always trusted).
  const threatUsers = humanAdmins.filter(
    (m) => m.id !== guild.ownerId && !whitelistUserIds.has(m.id),
  ).length;

  const botMembers = members.filter((m) => m.user?.bot).length;
  // Fall back to managed (integration) roles when the member cache is cold.
  const integrations = botMembers || roles.filter((r) => r.managed).length;

  const hooks = [...webhooks];
  const totalAssets = hooks.length;
  const threatAssets = hooks.filter((w) => {
    const owner = w.owner ?? null;
    const ownerId = owner?.id ?? w.ownerId ?? null;
    if (!ownerId) return true; // ownerless webhooks are unaccountable
    return !owner?.bot && !whitelistUserIds.has(ownerId);
  }).length;

  const features = {
    "Anti-Nuke": Boolean(antinuke.enabled),
    "Anti-Raid": Boolean(antinuke.antiRaidEnabled),
    "Auto-Mod": Boolean(automod.enabled),
    "Auto-Revert": Boolean(antinuke.autoRevert),
    "Panic Mode": Boolean(antinuke.panicMode),
    "Mod Logging": Boolean(config.modLogEnabled),
  };

  let score = 100;
  if (!features["Anti-Nuke"]) score -= 35;
  if (!features["Anti-Raid"]) score -= 15;
  if (!features["Auto-Mod"]) score -= 15;
  score -= Math.min(20, permRisk * 5);
  score -= Math.min(15, threatRoles.length * 5);
  score -= Math.min(15, threatUsers * 3);
  score -= Math.min(10, threatAssets * 5);
  const integrity = Math.max(0, Math.min(100, Math.round(score)));

  return {
    integrity,
    tier: integrityTier(integrity),
    firewall: features["Anti-Nuke"],
    roles: roles.length,
    adminRoles: adminRoles.length,
    threatRoles: threatRoles.length,
    permRisk,
    channels,
    privileged,
    threatUsers,
    integrations,
    totalAssets,
    threatAssets,
    members: guild.memberCount ?? members.length,
    features,
  };
}
