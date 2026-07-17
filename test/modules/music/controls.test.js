import { describe, it, expect, vi } from "vitest";
import { handleControl } from "../../../src/modules/music/controls.js";

function fakePlayer(overrides = {}) {
  return {
    voiceChannelId: "vc1",
    paused: false,
    repeatMode: "off",
    volume: 100,
    position: 0,
    queue: { current: { info: { title: "Song", duration: 200000 }, requester: { id: "u1" } }, tracks: [] },
    get: () => undefined,
    pause: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    destroy: vi.fn(),
    setRepeatMode: vi.fn(),
    ...overrides,
  };
}

function fakeInteraction(customId, { channelId = "vc1", player } = {}) {
  return {
    customId,
    guildId: "g1",
    member: { voice: { channelId } },
    update: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
    _ctx: {
      music: { isEnabled: true, getPlayer: () => player },
    },
  };
}

const ctxWith = (player) => ({ music: { isEnabled: true, getPlayer: () => player } });

describe("handleControl", () => {
  it("rejects ephemerally when nothing is playing", async () => {
    const i = fakeInteraction("music:pause");
    await handleControl(i, ctxWith(undefined));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(i.update).not.toHaveBeenCalled();
  });

  it("rejects ephemerally when the member is in a different voice channel", async () => {
    const player = fakePlayer();
    const i = fakeInteraction("music:pause", { channelId: "other" });
    await handleControl(i, ctxWith(player));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(player.pause).not.toHaveBeenCalled();
  });

  it("pauses when playing and re-renders", async () => {
    const player = fakePlayer({ paused: false });
    const i = fakeInteraction("music:pause");
    await handleControl(i, ctxWith(player));
    expect(player.pause).toHaveBeenCalled();
    expect(i.update).toHaveBeenCalled();
  });

  it("resumes when paused", async () => {
    const player = fakePlayer({ paused: true });
    const i = fakeInteraction("music:pause");
    await handleControl(i, ctxWith(player));
    expect(player.resume).toHaveBeenCalled();
  });

  it("skips the current track", async () => {
    const player = fakePlayer();
    await handleControl(fakeInteraction("music:skip"), ctxWith(player));
    expect(player.skip).toHaveBeenCalled();
  });

  it("stops by destroying the player and clears the controls", async () => {
    const player = fakePlayer();
    const i = fakeInteraction("music:stop");
    await handleControl(i, ctxWith(player));
    expect(player.destroy).toHaveBeenCalled();
    expect(i.update.mock.calls[0][0].components).toEqual([]);
  });

  it("cycles the loop mode off → track → queue → off", async () => {
    const player = fakePlayer({ repeatMode: "off" });
    await handleControl(fakeInteraction("music:loop"), ctxWith(player));
    expect(player.setRepeatMode).toHaveBeenCalledWith("track");

    player.repeatMode = "track";
    await handleControl(fakeInteraction("music:loop"), ctxWith(player));
    expect(player.setRepeatMode).toHaveBeenCalledWith("queue");

    player.repeatMode = "queue";
    await handleControl(fakeInteraction("music:loop"), ctxWith(player));
    expect(player.setRepeatMode).toHaveBeenCalledWith("off");
  });

  it("shuffles the queue", async () => {
    const shuffle = vi.fn();
    const player = fakePlayer();
    player.queue = { ...player.queue, tracks: [{}, {}], shuffle };
    await handleControl(fakeInteraction("music:shuffle"), ctxWith(player));
    expect(shuffle).toHaveBeenCalled();
  });

  it("shows the queue ephemerally without changing the message", async () => {
    const player = fakePlayer();
    const i = fakeInteraction("music:queue");
    await handleControl(i, ctxWith(player));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(i.update).not.toHaveBeenCalled();
  });

  it("ignores an unknown action", async () => {
    const player = fakePlayer();
    const i = fakeInteraction("music:bogus");
    await expect(handleControl(i, ctxWith(player))).resolves.toBeUndefined();
  });
});
