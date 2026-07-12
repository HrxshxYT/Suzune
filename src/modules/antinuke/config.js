import { DEFAULT_THRESHOLDS } from "./actions.js";

export function isWhitelisted(member, whitelist = []) {
  if (!member) return false;
  for (const entry of whitelist) {
    if (entry.type === "user" && entry.targetId === member.id) return true;
    if (entry.type === "role" && member.roles.cache.has(entry.targetId)) return true;
  }
  return false;
}

// Preset choices offered in the whitelist-limits panel.
export const WL_LIMIT_CHOICES = [5, 10, 15, 20, 25];
export const WL_WINDOW_CHOICES = [10, 20, 30, 40, 60];

// Destructive actions that can carry a per-action whitelist limit, with the
// short labels shown in the panel's action picker.
export const WATCHED_ACTIONS = [
  ["ban", "Bans"],
  ["kick", "Kicks"],
  ["prune", "Prune members"],
  ["channelCreate", "Channel create"],
  ["channelDelete", "Channel delete"],
  ["channelUpdate", "Channel update"],
  ["roleCreate", "Role create"],
  ["roleDelete", "Role delete"],
  ["roleUpdateDangerous", "Role grants admin"],
  ["webhookCreate", "Webhook create"],
  ["webhookDelete", "Webhook delete"],
  ["botAdd", "Bot add"],
  ["guildUpdate", "Server update"],
  ["emojiDelete", "Emoji delete"],
  ["stickerDelete", "Sticker delete"],
];

export const ACTION_LABELS = Object.fromEntries(WATCHED_ACTIONS);

// Per-action limit applied to whitelisted users when the feature is on.
// Defaults to disabled with a lenient 20-actions / 30s cap.
export function getWhitelistLimit(antinukeConfig, actionKey) {
  const o = antinukeConfig?.whitelistLimits?.[actionKey] ?? {};
  return {
    enabled: o.enabled ?? false,
    limit: o.limit ?? 20,
    windowSec: o.windowSec ?? 30,
  };
}

export function getThreshold(antinukeConfig, actionKey) {
  const def = DEFAULT_THRESHOLDS[actionKey] ?? { limit: 3, windowSec: 10, enabled: true };
  const override = antinukeConfig?.thresholds?.[actionKey] ?? {};
  return {
    limit: override.limit ?? def.limit,
    windowSec: override.windowSec ?? def.windowSec,
    enabled: override.enabled ?? def.enabled,
  };
}
