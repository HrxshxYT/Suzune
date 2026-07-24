import { describe, it, expect } from "vitest";
import RE2 from "re2";
import { evaluate } from "../../../src/modules/automod/pipeline/evaluate.js";
import { Budget } from "../../../src/modules/automod/budget.js";

const rule = () => ({
  id: "r1",
  source: "custom",
  target: "normalized",
  weight: 20,
  deleteOnHit: true,
  dryRun: false,
  re: new RE2("nitro", "i"),
});

describe("evaluate", () => {
  it("emits a hit when a rule matches its target variant", () => {
    const { hits } = evaluate({
      variants: { raw: "NITRO", normalized: "nitro", stripped: "nitro" },
      urls: [],
      compiledRules: [rule()],
      blocklist: new Set(),
      shorteners: new Set(),
      budget: new Budget(),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].weight).toBe(20);
  });
  it("matches target=any against all variants", () => {
    const r = { ...rule(), target: "any", re: new RE2("discordgift", "i") };
    const { hits } = evaluate({
      variants: { raw: "x", normalized: "x", stripped: "discordgift" },
      urls: [],
      compiledRules: [r],
      blocklist: new Set(),
      shorteners: new Set(),
      budget: new Budget(),
    });
    expect(hits).toHaveLength(1);
  });
  it("adds URL analysis hits", () => {
    const { hits } = evaluate({
      variants: { raw: "", normalized: "", stripped: "" },
      urls: [
        {
          hostname: "bad.example",
          href: "https://bad.example/",
          protocol: "https:",
          pathname: "/",
        },
      ],
      compiledRules: [],
      blocklist: new Set(["bad.example"]),
      shorteners: new Set(),
      budget: new Budget(),
    });
    expect(hits.some((h) => h.source === "url:blocklist")).toBe(true);
  });
  it("self-heals: a rule over per-rule budget is reported disabled", () => {
    let t = 0;
    const slow = {
      ...rule(),
      id: "slow",
      re: {
        test: () => {
          t = 10;
          return true;
        },
      },
    };
    const budget = new Budget({ perRuleMs: 5, now: () => t });
    const { disabled } = evaluate({
      variants: { raw: "nitro", normalized: "nitro", stripped: "nitro" },
      urls: [],
      compiledRules: [slow],
      blocklist: new Set(),
      shorteners: new Set(),
      budget,
    });
    expect(disabled.some((d) => d.id === "slow")).toBe(true);
  });
});
