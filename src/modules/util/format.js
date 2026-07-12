import { GuildVerificationLevel, PermissionFlagsBits } from "discord.js";

// Discord snowflakes and Date-likes → a "<t:unix:F> (<t:unix:R>)" markup string
// that each viewer's client renders in their own locale.
export function timestamps(dateLike) {
  const unix = Math.floor(new Date(dateLike).getTime() / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

const VERIFICATION_LABELS = {
  [GuildVerificationLevel.None]: "None",
  [GuildVerificationLevel.Low]: "Low",
  [GuildVerificationLevel.Medium]: "Medium",
  [GuildVerificationLevel.High]: "High",
  [GuildVerificationLevel.VeryHigh]: "Highest",
};

export function humanizeVerification(level) {
  return VERIFICATION_LABELS[level] ?? "Unknown";
}

const PRESENCE_LABELS = {
  online: "🟢 Online",
  idle: "🌙 Idle",
  dnd: "⛔ Do Not Disturb",
  offline: "⚫ Offline",
  invisible: "⚫ Offline",
};

export function humanizePresence(status) {
  return PRESENCE_LABELS[status] ?? "⚫ Offline";
}

// Notable permissions worth surfacing in userinfo, most significant first.
const KEY_PERMISSIONS = [
  [PermissionFlagsBits.Administrator, "Administrator"],
  [PermissionFlagsBits.ManageGuild, "Manage Server"],
  [PermissionFlagsBits.ManageRoles, "Manage Roles"],
  [PermissionFlagsBits.ManageChannels, "Manage Channels"],
  [PermissionFlagsBits.ManageMessages, "Manage Messages"],
  [PermissionFlagsBits.BanMembers, "Ban Members"],
  [PermissionFlagsBits.KickMembers, "Kick Members"],
  [PermissionFlagsBits.ModerateMembers, "Timeout Members"],
];

export function keyPermissions(permissions) {
  if (!permissions) return [];
  if (permissions.has(PermissionFlagsBits.Administrator)) return ["Administrator"];
  return KEY_PERMISSIONS.filter(([bit]) => permissions.has(bit)).map(([, label]) => label);
}

// Friendly labels for the public user badge flags we care about.
const FLAG_LABELS = {
  Staff: "Discord Staff",
  Partner: "Partner",
  Hypesquad: "HypeSquad Events",
  HypeSquadOnlineHouse1: "HypeSquad Bravery",
  HypeSquadOnlineHouse2: "HypeSquad Brilliance",
  HypeSquadOnlineHouse3: "HypeSquad Balance",
  BugHunterLevel1: "Bug Hunter",
  BugHunterLevel2: "Bug Hunter Gold",
  PremiumEarlySupporter: "Early Supporter",
  VerifiedDeveloper: "Early Verified Bot Developer",
  CertifiedModerator: "Moderator Programs Alumni",
  ActiveDeveloper: "Active Developer",
  VerifiedBot: "Verified Bot",
};

export function humanizeFlags(flags) {
  if (!flags) return [];
  return flags
    .toArray()
    .map((name) => FLAG_LABELS[name])
    .filter(Boolean);
}
