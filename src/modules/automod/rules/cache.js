import { compileRule } from "./compile.js";

// Holds compiled matchers per guild. Compilation happens here (once, at set
// time) rather than per message. Invalid rules are skipped, not fatal, so one
// bad row can't blank a guild's whole ruleset.
export class RuleCache {
  constructor(logger = { warn: () => {} }) {
    this.logger = logger;
    this.map = new Map(); // guildId -> compiled[]
  }

  set(guildId, rules) {
    const compiled = [];
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      try {
        compiled.push(compileRule(rule));
      } catch (err) {
        this.logger.warn?.({ err: err.message, pattern: rule.pattern }, "automod: rule compile skipped");
      }
    }
    this.map.set(guildId, compiled);
    return compiled;
  }

  get(guildId) {
    return this.map.get(guildId);
  }

  invalidate(guildId) {
    this.map.delete(guildId);
  }
}
