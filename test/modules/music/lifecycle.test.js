import { describe, it, expect, vi } from "vitest";
import { onTrackStart, onQueueEnd, onTrackError } from "../../../src/modules/music/lifecycle.js";

function fakePlayer(overrides = {}) {
  const data = new Map(Object.entries(overrides.data ?? {}));
  return {
    textChannelId: "text1",
    voiceChannelId: "vc1",
    volume: 100,
    position: 0,
    paused: false,
    repeatMode: "off",
    queue: { current: { info: { title: "Song", duration: 200000 }, requester: { id: "u1" } }, tracks: [] },
    get: (k) => data.get(k),
    set: (k, v) => data.set(k, v),
    skip: vi.fn(),
    ...overrides,
  };
}

function fakeChannel() {
  return {
    send: vi.fn(async () => ({ id: "msg-new" })),
    messages: { delete: vi.fn(async () => {}) },
  };
}

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

describe("onTrackStart", () => {
  it("posts the Now-Playing message and stores its id on the player", async () => {
    const player = fakePlayer();
    const channel = fakeChannel();
    await onTrackStart(player, player.queue.current, { fetchChannel: async () => channel, logger });
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
    expect(player.get("npMessageId")).toBe("msg-new");
  });

  it("deletes the previous Now-Playing message first", async () => {
    const player = fakePlayer({ data: { npMessageId: "old-msg" } });
    const channel = fakeChannel();
    await onTrackStart(player, player.queue.current, { fetchChannel: async () => channel, logger });
    expect(channel.messages.delete).toHaveBeenCalledWith("old-msg");
  });

  it("does nothing when the text channel can't be fetched", async () => {
    const player = fakePlayer();
    await expect(
      onTrackStart(player, player.queue.current, { fetchChannel: async () => null, logger }),
    ).resolves.toBeUndefined();
    expect(player.get("npMessageId")).toBeUndefined();
  });
});

describe("onQueueEnd", () => {
  it("asks for a recommendation when autoplay is on", async () => {
    const player = fakePlayer({ data: { autoplay: true } });
    const autoplay = vi.fn(async () => {});
    const scheduleLeave = vi.fn();
    await onQueueEnd(player, { autoplay, scheduleLeave, logger });
    expect(autoplay).toHaveBeenCalledWith(player);
    expect(scheduleLeave).not.toHaveBeenCalled();
  });

  it("schedules an idle disconnect when autoplay is off", async () => {
    const player = fakePlayer({ data: { autoplay: false } });
    const autoplay = vi.fn();
    const scheduleLeave = vi.fn();
    await onQueueEnd(player, { autoplay, scheduleLeave, logger });
    expect(scheduleLeave).toHaveBeenCalledWith(player);
    expect(autoplay).not.toHaveBeenCalled();
  });
});

describe("onTrackError", () => {
  it("logs and skips to the next track", async () => {
    const player = fakePlayer();
    await onTrackError(player, player.queue.current, { logger });
    expect(logger.error).toHaveBeenCalled();
    expect(player.skip).toHaveBeenCalled();
  });
});
