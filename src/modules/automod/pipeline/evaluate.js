import { analyzeUrls } from "./url.js";

const VARIANT_KEYS = ["raw", "normalized", "stripped"];

function targetsFor(target) {
  return target === "any" ? VARIANT_KEYS : [target];
}

// Run every compiled rule against its target variant(s), plus URL analysis.
// Returns hits (heat contributions) and any rules that blew their time budget.
export function evaluate({ variants, urls, compiledRules, blocklist, shorteners, budget }) {
  const hits = [];
  const disabled = [];

  for (const rule of compiledRules) {
    if (budget.overBudget()) break; // message-level ceiling reached
    const { result, over } = budget.timeRule(() =>
      targetsFor(rule.target).some((k) => rule.re.test(variants[k] ?? "")),
    );
    if (over) {
      disabled.push({ id: rule.id, reason: `exceeded ${budget.perRuleMs}ms eval budget` });
      continue;
    }
    if (result)
      hits.push({
        source: rule.source === "custom" ? `custom:${rule.id}` : rule.source,
        weight: rule.weight,
        deleteOnHit: rule.deleteOnHit,
        dryRun: rule.dryRun,
      });
  }

  for (const u of analyzeUrls(urls, { blocklist, shorteners })) {
    hits.push({ source: `url:${u.kind}`, weight: u.weight, deleteOnHit: true, dryRun: false });
  }

  return { hits, disabled };
}
