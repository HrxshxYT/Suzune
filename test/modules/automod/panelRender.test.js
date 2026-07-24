import { describe, it, expect } from "vitest";
import { buildAutomodView, ACTIONS } from "../../../src/modules/automod/panel/render.js";

const automod = (over = {}) => ({
  enabled: true,
  heatThreshold: 100,
  thresholdAction: "timeout",
  heatDecaySec: 60,
  exemptRoles: [],
  exemptChannels: [],
  ...over,
});

const packStates = (over = []) => [{ packId: "nitro", enabled: true, installedVersion: 1 }, ...over];

describe("buildAutomodView", () => {
  it("fits in 5 rows (Discord's max)", () => {
    const { components } = buildAutomodView(automod(), packStates(), "o1");
    expect(components.length).toBe(5);
  });

  it("exposes the enable toggle, native nav, close, action select, packs, exempt selects", () => {
    const { components } = buildAutomodView(automod(), packStates(), "o1");
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("am:tog:enabled:o1");
    expect(ids).toContain("am:nav:native:o1");
    expect(ids).toContain("am:close:o1");
    expect(ids).toContain("am:action:o1");
    expect(ids).toContain("am:packs:o1");
    expect(ids).toContain("am:exroles:o1");
    expect(ids).toContain("am:exchans:o1");
  });

  it("renders the threshold action select and pack row (brief's regex check)", () => {
    const view = buildAutomodView(
      { enabled: true, heatThreshold: 100, thresholdAction: "timeout", exemptRoles: [], exemptChannels: [] },
      [{ packId: "nitro", enabled: true, installedVersion: 1 }],
      "owner",
    );
    const json = JSON.stringify(view);
    expect(json).toMatch(/am:action:owner/);
    expect(json).toMatch(/am:packs:owner/);
  });

  it("does not render any of the removed legacy filter toggles", () => {
    const { components } = buildAutomodView(automod(), packStates(), "o1");
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    for (const col of ["antiSpam", "antiMentionSpam", "filterInvites", "filterLinks", "antiCaps", "antiEmojiSpam"]) {
      expect(ids).not.toContain(`am:tog:${col}:o1`);
    }
  });

  it("defaults the action select to automod.thresholdAction", () => {
    const { components } = buildAutomodView(automod({ thresholdAction: "kick" }), packStates(), "o1");
    const select = components.flatMap((r) => r.components).find((c) => c.data.custom_id === "am:action:o1");
    const options = select.options.map((o) => o.data);
    expect(options.map((o) => o.value)).toEqual(ACTIONS.map(([v]) => v));
    expect(options.find((o) => o.value === "kick").default).toBe(true);
    expect(options.filter((o) => o.default).length).toBe(1);
  });

  it("marks enabled packs as selected by default in the packs row", () => {
    const { components } = buildAutomodView(
      automod(),
      [
        { packId: "nitro", enabled: true, installedVersion: 1 },
        { packId: "core", enabled: false, installedVersion: 1 },
      ],
      "o1",
    );
    const select = components.flatMap((r) => r.components).find((c) => c.data.custom_id === "am:packs:o1");
    const options = select.options.map((o) => o.data);
    const nitroOpt = options.find((o) => o.value === "nitro");
    const coreOpt = options.find((o) => o.value === "core");
    expect(nitroOpt.default).toBe(true);
    expect(coreOpt.default).toBe(false);
  });

  it("shows heat threshold, action, decay, and pack count in the embed", () => {
    const { embeds } = buildAutomodView(automod({ heatThreshold: 250, heatDecaySec: 30 }), packStates(), "o1");
    const json = JSON.stringify(embeds[0].data);
    expect(json).toContain("250");
    expect(json).toContain("timeout");
    expect(json).toContain("30s");
    expect(json).not.toMatch(/antiSpam|antiMentionSpam|filterInvites|filterLinks|antiCaps|antiEmojiSpam/);
  });
});
