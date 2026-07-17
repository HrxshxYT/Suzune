import { describe, it, expect } from "vitest";
import { buildNowPlaying } from "../../../src/modules/music/nowPlaying.js";
import { COLORS } from "../../../src/lib/constants.js";

function track(overrides = {}) {
  return {
    info: {
      title: "Never Gonna Give You Up",
      author: "Rick Astley",
      uri: "https://youtu.be/dQw4w9WgXcQ",
      artworkUrl: "https://img/thumb.jpg",
      duration: 212000,
      isStream: false,
      ...overrides,
    },
    requester: { id: "u1", username: "hrxshx" },
  };
}

function player(overrides = {}) {
  const current = overrides.current ?? track();
  return {
    position: 60000,
    volume: 80,
    paused: false,
    repeatMode: "off",
    voiceChannelId: "vc1",
    queue: { current, tracks: overrides.tracks ?? [] },
    get: () => undefined,
    ...overrides,
  };
}

function customIds(payload) {
  return payload.components.flatMap((row) => row.toJSON().components.map((c) => c.custom_id));
}

describe("buildNowPlaying", () => {
  it("builds a purple embed with the track's title, link, artwork and progress", () => {
    const p = player();
    const { embeds } = buildNowPlaying({ track: p.queue.current, player: p });
    const e = embeds[0].toJSON();
    expect(e.color).toBe(COLORS.brand);
    expect(e.title).toBe("Never Gonna Give You Up");
    expect(e.url).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(e.thumbnail.url).toBe("https://img/thumb.jpg");
    expect(e.description).toContain("●"); // progress knob
    expect(JSON.stringify(e)).toContain("80"); // volume field
    expect(JSON.stringify(e)).toContain("u1"); // requester mention
  });

  it("exposes the full control button set", () => {
    const ids = customIds(buildNowPlaying({ player: player() }));
    expect(ids).toEqual(
      expect.arrayContaining([
        "music:pause",
        "music:skip",
        "music:stop",
        "music:loop",
        "music:shuffle",
        "music:queue",
      ]),
    );
  });

  it("labels the play/pause button by state", () => {
    const playing = buildNowPlaying({ player: player({ paused: false }) });
    const paused = buildNowPlaying({ player: player({ paused: true }) });
    const label = (payload) =>
      payload.components
        .flatMap((r) => r.toJSON().components)
        .find((c) => c.custom_id === "music:pause").label;
    expect(label(playing)).toMatch(/pause/i);
    expect(label(paused)).toMatch(/resume/i);
  });

  it("disables shuffle when fewer than two tracks are queued", () => {
    const one = buildNowPlaying({ player: player({ tracks: [] }) });
    const many = buildNowPlaying({ player: player({ tracks: [track(), track()] }) });
    const shuffle = (payload) =>
      payload.components
        .flatMap((r) => r.toJSON().components)
        .find((c) => c.custom_id === "music:shuffle");
    expect(shuffle(one).disabled).toBe(true);
    expect(shuffle(many).disabled).toBe(false);
  });

  it("shows a live indicator for streams instead of a progress bar", () => {
    const p = player({ current: track({ isStream: true, duration: 0 }) });
    const e = buildNowPlaying({ track: p.queue.current, player: p }).embeds[0].toJSON();
    expect(e.description).toContain("LIVE");
  });
});
