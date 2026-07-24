// src/modules/automod/rules/compile.js
import { validatePattern } from "./validate.js";

// Compile a rule row into a matcher. Throws on invalid input — callers compile
// at SAVE time (never per message), so a throw here surfaces to the admin.
export function compileRule(rule) {
  const v = validatePattern(rule.pattern);
  if (!v.ok) throw new Error(v.error);
  return { ...rule, re: v.re };
}
