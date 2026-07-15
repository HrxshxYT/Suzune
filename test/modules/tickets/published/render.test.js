import { describe, it, expect } from "vitest";
import { buildPublishedPanel } from "../../../../src/modules/tickets/published/render.js";

const panel = (over = {}) => ({
  id: "p1", title: "Support", description: "Pick one",
  categories: [
    { id: "c1", label: "General", emoji: null, description: "help" },
    { id: "c2", label: "Billing", emoji: "💳", description: null },
  ],
  ...over,
});

describe("buildPublishedPanel", () => {
  it("renders an embed + a select whose id carries the panel id", () => {
    const { embeds, components } = buildPublishedPanel(panel());
    expect(embeds[0].data.title).toBe("Support");
    const select = components[0].components[0].data;
    expect(select.custom_id).toBe("ticket:open:p1");
  });

  it("maps each category to an option with its id as value", () => {
    const { components } = buildPublishedPanel(panel());
    const opts = components[0].components[0].options;
    expect(opts.map((o) => o.data.value)).toEqual(["c1", "c2"]);
    expect(opts.map((o) => o.data.label)).toEqual(["General", "Billing"]);
    expect(opts[1].data.emoji).toBeTruthy();
  });

  it("disables the select when there are no categories", () => {
    const { components } = buildPublishedPanel(panel({ categories: [] }));
    expect(components[0].components[0].data.disabled).toBe(true);
  });
});
