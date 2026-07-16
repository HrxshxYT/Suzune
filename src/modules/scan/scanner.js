import { PermissionFlagsBits, GuildVerificationLevel } from "discord.js";
import { computeMetrics, integrityTier } from "../dashboard/metrics.js";

// Permissions the bot itself needs for protection/moderation to actually work.
const REQUIRED_BOT_PERMS = [
  ["View Audit Log", PermissionFlagsBits.ViewAuditLog],
  ["Ban Members", PermissionFlagsBits.BanMembers],
  ["Kick Members", PermissionFlagsBits.KickMembers],
  ["Manage Roles", PermissionFlagsBits.ManageRoles],
  ["Manage Channels", PermissionFlagsBits.ManageChannels],
  ["Manage Webhooks", PermissionFlagsBits.ManageWebhooks],
  ["Timeout Members", PermissionFlagsBits.ModerateMembers],
];

// Permissions that are dangerous when granted to @everyone.
const EVERYONE_DANGER = [
  ["Administrator", PermissionFlagsBits.Administrator],
  ["Manage Server", PermissionFlagsBits.ManageGuild],
  ["Manage Roles", PermissionFlagsBits.ManageRoles],
  ["Manage Channels", PermissionFlagsBits.ManageChannels],
  ["Manage Webhooks", PermissionFlagsBits.ManageWebhooks],
  ["Ban Members", PermissionFlagsBits.BanMembers],
  ["Kick Members", PermissionFlagsBits.KickMembers],
  ["Mention Everyone", PermissionFlagsBits.MentionEveryone],
];

// Permissions that make an above-the-bot role "unmanageable and dangerous".
const BROKEN_ROLE_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
];

function has(perms, bit) {
  return Boolean(perms?.has?.(bit));
}
function rolesOf(guild) {
  return [...(guild.roles?.cache?.values?.() ?? [])];
}

function gradeFor(score) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

// Settings the owner/admin should turn on, derived from what's currently off.
function buildRecommendations({ antinuke, automod, config, metrics }) {
  const recs = [];
  if (!antinuke.enabled) recs.push({ label: "Enable Anti-Nuke protection", command: "/antinuke enable" });
  if (!antinuke.antiRaidEnabled) recs.push({ label: "Turn on Anti-Raid", command: "/antinuke → Anti-Raid" });
  if (!automod.enabled) recs.push({ label: "Enable Auto-Moderation filters", command: "/automod" });
  if (antinuke.enabled && !antinuke.autoRevert) recs.push({ label: "Enable Anti-Nuke auto-revert", command: "/antinuke → Auto-Revert" });
  if (antinuke.enabled && !antinuke.alertChannelId) recs.push({ label: "Set an Anti-Nuke alert channel", command: "/antinuke alertchannel" });
  if (metrics.threatUsers > 0 || metrics.threatRoles > 0)
    recs.push({ label: "Whitelist your trusted admins & roles", command: "/antinuke whitelist add" });
  if (!config.modLogEnabled) recs.push({ label: "Enable moderation logging", command: "/logging" });
  if (recs.length === 0) recs.push({ label: "All core protections are on — keep it up!", command: "" });
  return recs;
}

// Runs a deep security audit of a guild: reuses the dashboard analytics and
// layers on prioritised findings (threats, broken roles, permission gaps,
// server hardening) plus concrete settings to enable. Pure and testable.
export function scanGuild({ guild, config = {}, webhooks = [], botMember = null } = {}) {
  const metrics = computeMetrics({ guild, config, webhooks });
  const antinuke = config.antinuke ?? {};
  const automod = config.automod ?? {};

  const findings = [];
  const add = (severity, title, detail) => findings.push({ severity, title, detail });

  // Protection posture.
  if (!antinuke.enabled)
    add("critical", "Anti-Nuke is disabled", "No protection against mass bans, channel/role wipes or permission grabs.");
  if (!antinuke.antiRaidEnabled)
    add("warning", "Anti-Raid is disabled", "Join-spike raids will not be auto-mitigated.");
  if (!automod.enabled)
    add("warning", "Auto-Moderation is disabled", "Spam, mass-mentions and malicious links are not filtered.");
  if (antinuke.enabled && !antinuke.autoRevert)
    add("info", "Auto-revert is off", "Anti-Nuke will punish but not undo destructive changes automatically.");
  if (antinuke.enabled && !antinuke.alertChannelId)
    add("info", "No Anti-Nuke alert channel", "Staff won't be notified when protection triggers.");
  if (antinuke.panicMode)
    add("info", "Panic mode is ON", "Every single destructive action currently trips Anti-Nuke.");

  // @everyone permissions.
  const everyone = rolesOf(guild).find((r) => r.id === guild.id);
  const everyoneDanger = everyone
    ? EVERYONE_DANGER.filter(([, b]) => has(everyone.permissions, b)).map(([n]) => n)
    : [];
  if (everyoneDanger.length)
    add("critical", "@everyone holds dangerous permissions", `${everyoneDanger.join(", ")} — every member has these.`);

  // Bot permission gaps.
  const missing = botMember
    ? REQUIRED_BOT_PERMS.filter(([, b]) => !has(botMember.permissions, b)).map(([n]) => n)
    : [];
  if (missing.length) {
    const severe = missing.includes("View Audit Log") || missing.includes("Ban Members");
    add(severe ? "critical" : "warning", "Bot is missing key permissions", `${missing.join(", ")}. Protection/mod actions will fail.`);
  }

  // Hierarchy / broken roles the bot can't act on.
  const botPos = botMember?.roles?.highest?.position ?? null;
  const roles = rolesOf(guild).filter((r) => r.id !== guild.id);
  let brokenRoles = [];
  if (botPos != null) {
    brokenRoles = roles.filter(
      (r) => !r.managed && r.position >= botPos && BROKEN_ROLE_PERMS.some((b) => has(r.permissions, b)),
    );
    if (brokenRoles.length) {
      const names = brokenRoles.slice(0, 5).map((r) => r.name).join(", ");
      add(
        "warning",
        `${brokenRoles.length} privileged role(s) rank above the bot`,
        `The bot cannot act on members holding these. Move its role higher: ${names}${brokenRoles.length > 5 ? "…" : ""}`,
      );
    }
  }

  // Threat surface from the analytics.
  if (metrics.threatRoles > 0)
    add("warning", `${metrics.threatRoles} unmanaged admin role(s)`, "Not whitelisted — prime nuke vectors. Whitelist or strip Administrator.");
  if (metrics.threatUsers > 0)
    add(metrics.threatUsers >= 3 ? "critical" : "warning", `${metrics.threatUsers} un-vouched administrator(s)`, "Admins with no trust record. Whitelist the ones you trust.");
  if (metrics.threatAssets > 0)
    add("warning", `${metrics.threatAssets} unaccountable webhook(s)`, "Webhooks not owned by a trusted user can spam or exfiltrate. Audit them.");

  // Server hardening.
  const vlevel = guild.verificationLevel;
  if (vlevel === GuildVerificationLevel.None || vlevel === GuildVerificationLevel.Low)
    add("info", "Low verification level", "Raise it to Medium/High to slow raid accounts.");
  if ((guild.mfaLevel ?? 0) === 0)
    add("info", "2FA not required for moderation", "Require 2FA for admins in Server Settings → Safety Setup.");
  if (!config.modLogEnabled)
    add("info", "Moderation logging is off", "Enable logging so every mod action is recorded.");

  // Prioritise: critical → warning → info.
  const order = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const counts = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;

  let score = 100 - counts.critical * 18 - counts.warning * 7 - counts.info * 2;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    metrics,
    findings,
    counts,
    score,
    tier: integrityTier(score),
    grade: gradeFor(score),
    brokenRoles: brokenRoles.length,
    recommendations: buildRecommendations({ antinuke, automod, config, metrics }),
  };
}
