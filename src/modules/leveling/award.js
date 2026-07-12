import { levelForXp } from "./curve.js";

export function shouldAward({ authorBot, inGuild, config, memberRoleIds = [], channelId }) {
  if (authorBot || !inGuild || !config?.enabled) return false;
  const ignoredChannels = config.ignoredChannels ?? [];
  const ignoredRoles = config.ignoredRoles ?? [];
  if (ignoredChannels.includes(channelId)) return false;
  if (memberRoleIds.some((r) => ignoredRoles.includes(r))) return false;
  return true;
}

export function randomXp(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function detectLevelUp(oldXp, newXp) {
  const oldLevel = levelForXp(oldXp);
  const newLevel = levelForXp(newXp);
  return { leveledUp: newLevel > oldLevel, oldLevel, newLevel };
}
