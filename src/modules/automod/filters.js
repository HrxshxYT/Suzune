const INVITE_RE = /(discord\.(gg|io|me)|discord(app)?\.com\/invite)\/\S+/i;
const URL_RE = /https?:\/\/\S+/i;
const CUSTOM_EMOJI_RE = /<a?:\w+:\d+>/g;
const UNICODE_EMOJI_RE = /\p{Extended_Pictographic}/gu;

export function countMentions(message) {
  const users = message.mentions?.users?.size ?? 0;
  const roles = message.mentions?.roles?.size ?? 0;
  return users + roles;
}

export function hasInvite(content) {
  return INVITE_RE.test(content ?? "");
}

export function hasLink(content) {
  return URL_RE.test(content ?? "");
}

export function capsRatio(content) {
  const letters = (content ?? "").replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return 0;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length;
}

export function isCapsSpam(content, { minLength, percent }) {
  const c = content ?? "";
  if (c.length < minLength) return false;
  return capsRatio(c) * 100 >= percent;
}

export function countEmoji(content) {
  const c = content ?? "";
  const custom = (c.match(CUSTOM_EMOJI_RE) ?? []).length;
  const unicode = (c.match(UNICODE_EMOJI_RE) ?? []).length;
  return custom + unicode;
}

export function isEmojiSpam(content, limit) {
  return countEmoji(content) >= limit;
}
