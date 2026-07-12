import { describe, it, expect } from "vitest";
import {
  buildMainView,
  buildWhitelistView,
  buildWhitelistLimitsView,
} from "../../../src/modules/antinuke/panel/render.js";

const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  serverOwnerId: "o1",
  view: "main",
  antinuke: { enabled: true, panicMode: false, autoRevert: true, antiRaidEnabled: false, punishment: "ban" },
  whitelist: [{ targetId: "u1", type: "user" }, { targetId: "r1", type: "role" }],
  ...over,
});

describe("buildMainView", () => {
  it("renders exactly 5 rows with the expected custom ids", () => {
    const { components } = buildMainView(state());
    expect(components).toHaveLength(5);
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("an:tog:enabled:o1");
    expect(ids).toContain("an:sel:punishment:o1");
    expect(ids).toContain("an:sel:alert:o1");
    expect(ids).toContain("an:sel:qrole:o1");
    expect(ids).toContain("an:adv:o1");
    expect(ids).toContain("an:wl:open:o1");
    expect(ids).toContain("an:wll:open:o1");
    expect(ids).toContain("an:close:o1");
  });

  it("shows the enabled toggle as green (Success=3) when on", () => {
    const btn = buildMainView(state()).components[0].components[0];
    expect(btn.data.style).toBe(3);
  });

  it("reflects whitelist count and punishment in the embed", () => {
    const json = JSON.stringify(buildMainView(state()).embeds[0].data);
    expect(json).toContain("Whitelist: 2");
    expect(json).toContain("ban");
  });
});

describe("buildWhitelistView", () => {
  it("lists entries and offers add/remove/back/close", () => {
    const { embeds, components } = buildWhitelistView(state({ view: "whitelist" }));
    expect(JSON.stringify(embeds[0].data)).toContain("<@u1>");
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("an:wl:add:o1");
    expect(ids).toContain("an:wl:remove:o1");
    expect(ids).toContain("an:wl:back:o1");
  });

  it("omits the remove select when the whitelist is empty", () => {
    const ids = buildWhitelistView(state({ view: "whitelist", whitelist: [] }))
      .components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).not.toContain("an:wl:remove:o1");
    expect(ids).toContain("an:wl:add:o1");
  });

  const addAndRemove = (components) => {
    const all = components.flatMap((r) => r.components);
    return {
      add: all.find((c) => c.data.custom_id === "an:wl:add:o1"),
      remove: all.find((c) => c.data.custom_id === "an:wl:remove:o1"),
    };
  };

  it("enables add/remove when the panel opener is the server owner", () => {
    const { embeds, components } = buildWhitelistView(
      state({ view: "whitelist", serverOwnerId: "o1" }),
    );
    const { add, remove } = addAndRemove(components);
    expect(add.data.disabled).toBeFalsy();
    expect(remove.data.disabled).toBeFalsy();
    expect(JSON.stringify(embeds[0].data)).not.toContain("Only the server owner");
  });

  it("disables add/remove and notes owner-only when opener is not the server owner", () => {
    const { embeds, components } = buildWhitelistView(
      state({ view: "whitelist", serverOwnerId: "someone-else" }),
    );
    const { add, remove } = addAndRemove(components);
    expect(add.data.disabled).toBe(true);
    expect(remove.data.disabled).toBe(true);
    expect(JSON.stringify(embeds[0].data)).toContain("Only the server owner can change the whitelist");
  });
});

describe("buildWhitelistLimitsView", () => {
  it("shows master toggle + action picker, and hides per-action rows until one is picked", () => {
    const { components } = buildWhitelistLimitsView(state({ view: "wllimits", wlAction: null }));
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("an:wll:toggle:o1");
    expect(ids).toContain("an:wll:pick:o1");
    expect(ids).toContain("an:wll:back:o1");
    expect(ids).not.toContain("an:wll:limit:o1");
    expect(components).toHaveLength(3);
  });

  it("reveals limit/window/per-action toggle once an action is picked (5 rows)", () => {
    const { components } = buildWhitelistLimitsView(state({ view: "wllimits", wlAction: "ban" }));
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("an:wll:limit:o1");
    expect(ids).toContain("an:wll:window:o1");
    expect(ids).toContain("an:wll:actog:o1");
    expect(components).toHaveLength(5);
  });

  it("summarizes configured per-action limits in the embed", () => {
    const s = state({
      view: "wllimits",
      wlAction: "ban",
      antinuke: {
        whitelistLimitEnabled: true,
        whitelistLimits: { ban: { enabled: true, limit: 15, windowSec: 40 } },
      },
    });
    const json = JSON.stringify(buildWhitelistLimitsView(s).embeds[0].data);
    expect(json).toContain("Bans");
    expect(json).toContain("15/40s");
  });
});
