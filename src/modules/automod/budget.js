export const PER_RULE_MS = 5;
export const PER_MESSAGE_MS = 25;

// Tracks evaluation time for one message. re2 is linear so this is a safety net:
// a rule that blows its per-rule budget is auto-disabled by the caller.
export class Budget {
  constructor({ perRuleMs = PER_RULE_MS, perMessageMs = PER_MESSAGE_MS, now = () => performance.now() } = {}) {
    this.perRuleMs = perRuleMs;
    this.perMessageMs = perMessageMs;
    this.now = now;
    this.start = now();
  }

  overBudget() {
    return this.now() - this.start > this.perMessageMs;
  }

  timeRule(fn) {
    const t0 = this.now();
    const result = fn();
    const ms = this.now() - t0;
    return { result, ms, over: ms > this.perRuleMs };
  }
}
