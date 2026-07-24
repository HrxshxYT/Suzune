import { describe, it, expect } from "vitest";
import { analyzeUrls, levenshtein } from "../../../src/modules/automod/pipeline/url.js";

const u = (hostname) => ({ hostname, href: `https://${hostname}/`, protocol: "https:", pathname: "/" });

describe("levenshtein", () => {
  it("computes edit distance", () => {
    // NOTE: identical strings have edit distance 0 (verified empirically against
    // the implementation below) - not 1. A pair that differs by a single
    // substitution has distance 1.
    expect(levenshtein("discord.com", "discord.com")).toBe(0);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("discord.com", "diskord.com")).toBe(1);
  });
});

describe("analyzeUrls", () => {
  const blocklist = new Set(["evil-scam.example"]);
  const shorteners = new Set(["bit.ly"]);
  it("flags blocklist hits (suffix match)", () => {
    const r = analyzeUrls([u("sub.evil-scam.example")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "blocklist")).toBe(true);
  });
  it("flags impersonation via edit distance 1-2", () => {
    // "diskord.com" is one substitution away from the target "discord.com".
    const r = analyzeUrls([u("diskord.com")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "impersonation")).toBe(true);
  });
  it("does not flag the exact target", () => {
    const r = analyzeUrls([u("discord.com")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "impersonation")).toBe(false);
    expect(r.some((x) => x.kind === "mixed-script")).toBe(false);
  });
  it("flags known shorteners", () => {
    const r = analyzeUrls([u("bit.ly")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "shortener")).toBe(true);
  });
  it("flags mixed-script hostnames", () => {
    // xn--dscord-3we.com decodes to "dήscord.com" - Latin 'd' + Greek 'ή' (eta
    // with tonos, U+03AE) + Latin "scord.com", i.e. a genuine mixed-script
    // (homograph) hostname on this Node build.
    const r = analyzeUrls([u("xn--dscord-3we.com")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "mixed-script")).toBe(true);
  });
});
