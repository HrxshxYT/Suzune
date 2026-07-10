import { DEFAULT_THRESHOLDS } from "./actions.js";

export function isWhitelisted(member, whitelist = []) {
  if (!member) return false;
  for (const entry of whitelist) {
    if (entry.type === "user" && entry.targetId === member.id) return true;
    if (entry.type === "role" && member.roles.cache.has(entry.targetId)) return true;
  }
  return false;
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
