import { describe, it, expect } from "vitest";
import { buildAuditView } from "../../../src/modules/audit/panel/render.js";
import { CATEGORIES } from "../../../src/modules/audit/categories.js";

describe("buildAuditView", () => {
  it("fits in 5 rows and exposes channel/all/disable/close ids", () => {
    const { components } = buildAuditView({ enabled: true, channelId: "c1", events: {} }, "o1");
    expect(components.length).toBeLessThanOrEqual(5);
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("au:chan:o1");
    expect(ids).toContain("au:all:on:o1");
    expect(ids).toContain("au:all:off:o1");
    expect(ids).toContain("au:disable:o1");
    expect(ids).toContain("au:close:o1");
  });

  it("has one toggle button per category", () => {
    const ids = buildAuditView({ enabled: true, events: {} }, "o1")
      .components.flatMap((r) => r.components.map((c) => c.data.custom_id))
      .filter((id) => id.startsWith("au:cat:"));
    expect(ids).toHaveLength(CATEGORIES.length);
  });

  it("renders a category as grey (Secondary=2) when explicitly off", () => {
    const { components } = buildAuditView({ enabled: true, events: { members: false } }, "o1");
    const btn = components
      .flatMap((r) => r.components)
      .find((c) => c.data.custom_id === "au:cat:members:o1");
    expect(btn.data.style).toBe(2);
  });
});
