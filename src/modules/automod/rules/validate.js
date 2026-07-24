// src/modules/automod/rules/validate.js
import RE2 from "re2";

export const MAX_PATTERN_LEN = 200;
export const MAX_RULES_PER_GUILD = 50;

// Patterns that match everything / empty are rejected: they'd flag every message.
const MATCH_ALL = new Set([".*", ".+", "(.*)", "(.+)", ".*?", ".+?"]);

export function validatePattern(src, { maxLen = MAX_PATTERN_LEN } = {}) {
  if (typeof src !== "string" || src.length === 0)
    return { ok: false, error: "Pattern is empty." };
  if (src.length > maxLen)
    return { ok: false, error: `Pattern too long (max ${maxLen} characters).` };
  if (MATCH_ALL.has(src.trim()))
    return { ok: false, error: "Pattern matches every message." };
  let re;
  try {
    re = new RE2(src, "i");
  } catch (e) {
    return { ok: false, error: `Invalid pattern: ${e.message} (re2 has no lookaround or backreferences).` };
  }
  if (re.test("")) return { ok: false, error: "Pattern matches the empty string." };
  return { ok: true, re };
}
