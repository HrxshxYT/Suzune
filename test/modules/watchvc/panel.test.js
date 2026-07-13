import { describe, it, expect, vi } from "vitest";
import { buildWatchVcView } from "../../../src/modules/watchvc/panel/render.js";
import { handleWatchVcComponent } from "../../../src/modules/watchvc/panel/handlers.js";

const owner = "o1";
const baseState = () => ({
  guildId: "g1",
  ownerId: owner,
  watchVc: { channelId: null, enabled: false },
});

describe("buildWatchVcView", () => {
  it("shows off state and disables toggle when no channel selected", () => {
    const view = buildWatchVcView(baseState());
    expect(view.embeds).toHaveLength(1);
    const flat = view.components.flatMap((r) => r.components);
    const toggle = flat.find((c) => c.data.custom_id === `wv:toggle:${owner}`);
    expect(toggle.data.disabled).toBe(true);
  });
  it("enables toggle once a channel is set", () => {
    const s = baseState();
    s.watchVc.channelId = "c1";
    const view = buildWatchVcView(s);
    const toggle = view.components
      .flatMap((r) => r.components)
      .find((c) => c.data.custom_id === `wv:toggle:${owner}`);
    expect(toggle.data.disabled).toBe(false);
  });
});

describe("handleWatchVcComponent", () => {
  it("selecting a channel stores it in state and config", async () => {
    const s = baseState();
    const ctx = { config: { updateWatchVc: vi.fn(async () => {}) } };
    const i = { customId: `wv:ch:${owner}`, values: ["c9"] };
    const out = await handleWatchVcComponent(i, s, ctx, () => ({}));
    expect(s.watchVc.channelId).toBe("c9");
    expect(ctx.config.updateWatchVc).toHaveBeenCalledWith("g1", { channelId: "c9" });
    expect(out).toBe("update");
  });

  it("toggle -> enable resolves the channel and calls service.enable", async () => {
    const s = baseState();
    s.watchVc.channelId = "c9";
    const channel = { id: "c9" };
    const enable = vi.fn(async () => ({ ok: true }));
    const ctx = {
      watchvc: { enable, disable: vi.fn() },
      client: { channels: { fetch: vi.fn(async () => channel) } },
    };
    const i = { customId: `wv:toggle:${owner}`, reply: vi.fn(async () => {}) };
    const out = await handleWatchVcComponent(i, s, ctx, () => ({}));
    expect(enable).toHaveBeenCalledWith(channel);
    expect(s.watchVc.enabled).toBe(true);
    expect(out).toBe("update");
  });

  it("toggle -> enable failure replies with the error and does not flip state", async () => {
    const s = baseState();
    s.watchVc.channelId = "c9";
    const enable = vi.fn(async () => ({ ok: false, error: "Missing permissions: Connect." }));
    const reply = vi.fn(async () => {});
    const ctx = {
      watchvc: { enable, disable: vi.fn() },
      client: { channels: { fetch: vi.fn(async () => ({ id: "c9" })) } },
    };
    const i = { customId: `wv:toggle:${owner}`, reply };
    const out = await handleWatchVcComponent(i, s, ctx, () => ({}));
    expect(reply).toHaveBeenCalled();
    expect(s.watchVc.enabled).toBe(false);
    expect(out).toBe("handled");
  });

  it("toggle when enabled calls disable", async () => {
    const s = baseState();
    s.watchVc.channelId = "c9";
    s.watchVc.enabled = true;
    const disable = vi.fn(async () => {});
    const ctx = { watchvc: { disable, enable: vi.fn() } };
    const i = { customId: `wv:toggle:${owner}` };
    const out = await handleWatchVcComponent(i, s, ctx, () => ({}));
    expect(disable).toHaveBeenCalledWith("g1");
    expect(s.watchVc.enabled).toBe(false);
    expect(out).toBe("update");
  });

  it("close returns close", async () => {
    const out = await handleWatchVcComponent(
      { customId: `wv:close:${owner}` },
      baseState(),
      {},
      () => ({}),
    );
    expect(out).toBe("close");
  });
});
