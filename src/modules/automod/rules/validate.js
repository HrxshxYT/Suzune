// src/modules/automod/rules/validate.js
// re2-wasm: a WebAssembly build of Google's RE2 — same linear-time, backtracking-
// immune engine as the native `re2` addon, but a pure JS/wasm package with no
// install script or native compile step. This matters for hosts that block
// dependency install scripts or lack a build toolchain (the native addon leaves
// no binary there). re2-wasm requires the Unicode ("u") flag on every pattern.
import { RE2 } from "re2-wasm";

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
    re = new RE2(src, "iu");
  } catch (e) {
    return { ok: false, error: `Invalid pattern: ${e.message} (re2 has no lookaround or backreferences).` };
  }
  if (re.test("")) return { ok: false, error: "Pattern matches the empty string." };
  return { ok: true, re };
}
