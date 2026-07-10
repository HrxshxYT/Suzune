import { PermissionFlagsBits } from "discord.js";
import { countMentions, hasInvite, hasLink, isCapsSpam, isEmojiSpam } from "./filters.js";

export function evaluateMessage({ message, config, spamCount }) {
  if (config.antiSpam && spamCount >= config.spamCount) return { tripped: true, reason: "spam" };
  if (config.antiMentionSpam && countMentions(message) >= config.mentionLimit)
    return { tripped: true, reason: "mention spam" };
  if (config.filterInvites && hasInvite(message.content))
    return { tripped: true, reason: "invite link" };
  if (config.filterLinks && hasLink(message.content))
    return { tripped: true, reason: "external link" };
  if (
    config.antiCaps &&
    isCapsSpam(message.content, { minLength: config.capsMinLength, percent: config.capsPercent })
  )
    return { tripped: true, reason: "excessive caps" };
  if (config.antiEmojiSpam && isEmojiSpam(message.content, config.emojiLimit))
    return { tripped: true, reason: "emoji spam" };
  return { tripped: false };
}

export function isExempt({ member, channelId, config }) {
  if (member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  const exemptRoles = config.exemptRoles ?? [];
  if (member && exemptRoles.some((r) => member.roles.cache.has(r))) return true;
  if ((config.exemptChannels ?? []).includes(channelId)) return true;
  return false;
}
