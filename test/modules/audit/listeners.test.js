import { describe, it, expect, vi } from "vitest";
import { Events } from "discord.js";
import listeners from "../../../src/modules/audit/events/audit.js";

function find(name) {
  return listeners.find((l) => l.name === name);
}

function auditCtx() {
  return {
    config: {
      getGuild: vi.fn(async () => ({ audit: { enabled: true, channelId: "c1", events: {} } })),
    },
    logger: { error: vi.fn() },
  };
}

describe("audit listeners", () => {
  it("exports a listener per tracked event", () => {
    expect(listeners.length).toBeGreaterThanOrEqual(20);
    expect(find(Events.MessageDelete)).toBeTruthy();
    expect(find(Events.GuildMemberAdd)).toBeTruthy();
    expect(find(Events.VoiceStateUpdate)).toBeTruthy();
  });

  it("messageDelete posts an embed to the configured channel", async () => {
    const send = vi.fn(async () => {});
    const channel = { isTextBased: () => true, send };
    const guild = { id: "g1", channels: { fetch: vi.fn(async () => channel) } };
    const ctx = auditCtx();
    const message = { guild, author: { id: "u1", bot: false }, channelId: "ch", content: "bye" };
    await find(Events.MessageDelete).execute(ctx, message);
    expect(send).toHaveBeenCalled();
  });

  it("ignores bot message deletions", async () => {
    const send = vi.fn(async () => {});
    const guild = { id: "g1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const ctx = auditCtx();
    const message = { guild, author: { id: "b", bot: true }, channelId: "ch", content: "x" };
    await find(Events.MessageDelete).execute(ctx, message);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not post a no-op member update", async () => {
    const send = vi.fn(async () => {});
    const guild = { id: "g1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const ctx = auditCtx();
    const m = {
      id: "u1",
      guild,
      nickname: null,
      roles: { cache: new Map() },
      communicationDisabledUntilTimestamp: null,
      user: { tag: "A#1", displayAvatarURL: () => "http://a/x" },
    };
    await find(Events.GuildMemberUpdate).execute(ctx, m, m);
    expect(send).not.toHaveBeenCalled();
  });
});
