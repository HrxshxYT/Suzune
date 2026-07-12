import { describe, it, expect } from "vitest";
import { buildAutomodView, FILTERS } from "../../../src/modules/automod/panel/render.js";

const automod = (over = {}) => ({
  enabled: true,
  action: "delete",
  antiSpam: true,
  exemptRoles: [],
  exemptChannels: [],
  ...over,
});

describe("buildAutomodView", () => {
  it("fits in 5 rows and exposes all control ids", () => {
    const { components } = buildAutomodView(automod(), "o1");
    expect(components.length).toBeLessThanOrEqual(5);
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("am:tog:enabled:o1");
    expect(ids).toContain("am:action:o1");
    expect(ids).toContain("am:exroles:o1");
    expect(ids).toContain("am:exchans:o1");
    expect(ids).toContain("am:close:o1");
    for (const [col] of FILTERS) expect(ids).toContain(`am:tog:${col}:o1`);
  });

  it("renders an on filter green (Success=3) and off filter grey (Secondary=2)", () => {
    const { components } = buildAutomodView(automod({ antiSpam: true, filterLinks: false }), "o1");
    const btns = components.flatMap((r) => r.components);
    expect(btns.find((c) => c.data.custom_id === "am:tog:antiSpam:o1").data.style).toBe(3);
    expect(btns.find((c) => c.data.custom_id === "am:tog:filterLinks:o1").data.style).toBe(2);
  });

  it("reflects exempt counts in the embed", () => {
    const json = JSON.stringify(
      buildAutomodView(automod({ exemptRoles: ["r1", "r2"], exemptChannels: ["c1"] }), "o1").embeds[0].data,
    );
    expect(json).toContain("2 roles");
    expect(json).toContain("1 channels");
  });
});
