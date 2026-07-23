import { describe, it, expect, vi } from "vitest";
import { handleLoggingComponent } from "../../../src/modules/config/logging/handlers.js";
import { buildLoggingView } from "../../../src/modules/config/logging/render.js";

const ctx = () => ({ config: { updateLogging: vi.fn(async () => ({})) } });
const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  logging: { disabled: [] },
  selected: null,
  ...over,
});

describe("handleLoggingComponent", () => {
  it("closes on the close button", async () => {
    const dir = await handleLoggingComponent({ customId: "lg:close:o1" }, state(), ctx());
    expect(dir).toBe("close");
  });

  it("selects a category from the picker", async () => {
    const s = state();
    const dir = await handleLoggingComponent(
      { customId: "lg:cat:o1", values: ["voice"] },
      s,
      ctx(),
    );
    expect(dir).toBe("update");
    expect(s.selected).toBe("voice");
  });

  it("routes the selected category to a channel", async () => {
    const c = ctx();
    const s = state({ selected: "memberJoinLeave" });
    await handleLoggingComponent({ customId: "lg:chan:o1", values: ["c1"] }, s, c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { memberJoinLeave: "c1" });
    expect(s.logging.memberJoinLeave).toBe("c1");
  });

  it("clears the channel when the select is emptied", async () => {
    const c = ctx();
    const s = state({ selected: "voice", logging: { voice: "c9", disabled: [] } });
    await handleLoggingComponent({ customId: "lg:chan:o1", values: [] }, s, c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { voice: null });
    expect(s.logging.voice).toBe(null);
  });

  it("disables the selected category", async () => {
    const c = ctx();
    const s = state({ selected: "voice" });
    await handleLoggingComponent({ customId: "lg:disable:o1" }, s, c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { disabled: ["voice"] });
    expect(s.logging.disabled).toEqual(["voice"]);
  });

  it("enables a previously disabled category", async () => {
    const c = ctx();
    const s = state({ selected: "voice", logging: { disabled: ["voice", "modActions"] } });
    await handleLoggingComponent({ customId: "lg:enable:o1" }, s, c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { disabled: ["modActions"] });
    expect(s.logging.disabled).toEqual(["modActions"]);
  });

  it("ignores channel/toggle actions when no category is selected", async () => {
    const c = ctx();
    const s = state({ selected: null });
    await handleLoggingComponent({ customId: "lg:chan:o1", values: ["c1"] }, s, c);
    await handleLoggingComponent({ customId: "lg:disable:o1" }, s, c);
    expect(c.config.updateLogging).not.toHaveBeenCalled();
  });
});

describe("buildLoggingView", () => {
  it("renders every category with its current state", () => {
    const view = buildLoggingView(
      { memberJoinLeave: "c1", disabled: ["voice"] },
      "o1",
      "memberJoinLeave",
    );
    expect(view.embeds).toHaveLength(1);
    const desc = view.embeds[0].data.description;
    expect(desc).toContain("<#c1>");
    expect(desc).toContain("disabled");
    // Three rows: category select, channel select, buttons.
    expect(view.components).toHaveLength(3);
  });

  it("disables the channel + toggle controls until a category is picked", () => {
    const view = buildLoggingView({ disabled: [] }, "o1", null);
    const channelSelect = view.components[1].components[0];
    expect(channelSelect.data.disabled).toBe(true);
  });
});
