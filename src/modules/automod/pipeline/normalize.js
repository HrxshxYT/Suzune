import { fold } from "../confusables/fold.js";

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const COMBINING = /\p{M}+/gu;
const RUN_3PLUS = /(.)\1{2,}/gsu; // 3+ identical → keep 2
const NON_ALNUM = /[^a-z0-9]+/gu;

// Stage 2 of the automod pipeline: normalize text to defeat character-level
// evasion (homoglyphs, zero-width joiners, combining marks, fullwidth forms,
// stretched-out letters, spaced-out text) before pattern matching runs.
export function normalize(text) {
  const raw = text ?? "";
  let s = raw.normalize("NFKC").replace(ZERO_WIDTH, "");
  s = s.normalize("NFD").replace(COMBINING, "").normalize("NFC");
  s = fold(s);
  s = s.toLowerCase().replace(RUN_3PLUS, "$1$1");
  const normalized = s;
  const stripped = s.replace(NON_ALNUM, "");
  return { raw, normalized, stripped };
}
