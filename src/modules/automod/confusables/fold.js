import { CONFUSABLES } from "./data.js";

// Map each code point through the Unicode skeleton table, folding homoglyphs to
// their canonical form. Iterating by code point (spread) handles astral chars.
export function fold(text) {
  let out = "";
  for (const ch of text ?? "") out += CONFUSABLES.get(ch) ?? ch;
  return out;
}
