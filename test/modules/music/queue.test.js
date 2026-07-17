import { describe, it, expect } from "vitest";
import { buildQueueEmbed } from "../../../src/modules/music/queue.js";

const t = (title, duration = 200000) => ({ info: { title, duration, author: "a" }, requester: { id: "u1" } });

function player(tracks, current = t("Current Song")) {
  return { queue: { current, tracks }, volume: 100, repeatMode: "off" };
}

describe("buildQueueEmbed", () => {
  it("shows the current track and the upcoming list", () => {
    const e = buildQueueEmbed({ player: player([t("Song A"), t("Song B")]) }).toJSON();
    const s = JSON.stringify(e);
    expect(s).toContain("Current Song");
    expect(s).toContain("Song A");
    expect(s).toContain("Song B");
  });

  it("paginates — page 1 shows the second block", () => {
    const tracks = Array.from({ length: 15 }, (_, i) => t(`Track ${i + 1}`));
    const page1 = JSON.stringify(buildQueueEmbed({ player: player(tracks), page: 1, pageSize: 10 }).toJSON());
    expect(page1).toContain("Track 11");
    expect(page1).not.toContain("Track 1 "); // avoid matching "Track 11"
  });

  it("handles an empty upcoming queue", () => {
    const s = JSON.stringify(buildQueueEmbed({ player: player([]) }).toJSON());
    expect(s.toLowerCase()).toContain("empty");
  });
});
