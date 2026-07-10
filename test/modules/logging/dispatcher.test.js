import { describe, it, expect, vi } from "vitest";
import {
  resolveLogChannelId,
  dispatchLog,
  logEvent,
} from "../../../src/modules/logging/dispatcher.js";

describe("resolveLogChannelId", () => {
  it("returns the configured channel for a category", () => {
    expect(resolveLogChannelId({ memberJoinLeave: "c1", disabled: [] }, "memberJoinLeave")).toBe(
      "c1",
    );
  });
  it("returns null when the category is disabled", () => {
    expect(
      resolveLogChannelId({ memberJoinLeave: "c1", disabled: ["memberJoinLeave"] }, "memberJoinLeave"),
    ).toBeNull();
  });
  it("returns null when unconfigured or config missing", () => {
    expect(resolveLogChannelId({ disabled: [] }, "voice")).toBeNull();
    expect(resolveLogChannelId(null, "voice")).toBeNull();
  });
});

describe("dispatchLog", () => {
  it("sends to the configured text channel", async () => {
    const send = vi.fn(async () => {});
    const guild = { channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const ok = await dispatchLog({
      guild,
      loggingConfig: { voice: "c1", disabled: [] },
      category: "voice",
      embed: {},
      logger: { error: vi.fn() },
    });
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ embeds: [{}] }));
  });
  it("returns false when the category is unconfigured", async () => {
    const guild = { channels: { fetch: vi.fn() } };
    const ok = await dispatchLog({
      guild,
      loggingConfig: { disabled: [] },
      category: "voice",
      embed: {},
      logger: { error: vi.fn() },
    });
    expect(ok).toBe(false);
    expect(guild.channels.fetch).not.toHaveBeenCalled();
  });
});

describe("logEvent", () => {
  it("loads guild config and dispatches", async () => {
    const send = vi.fn(async () => {});
    const guild = {
      id: "g1",
      channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) },
    };
    const ctx = {
      config: { getGuild: vi.fn(async () => ({ logging: { memberJoinLeave: "c1", disabled: [] } })) },
      logger: { error: vi.fn() },
    };
    const ok = await logEvent(ctx, guild, "memberJoinLeave", {});
    expect(ok).toBe(true);
  });
});
