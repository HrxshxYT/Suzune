import { describe, it, expect } from "vitest";
import { memberVoiceChannelId, sameVoiceChannel } from "../../../src/modules/music/guards.js";

const member = (channelId) => ({ voice: { channelId } });

describe("memberVoiceChannelId", () => {
  it("returns the member's voice channel id", () => {
    expect(memberVoiceChannelId(member("vc1"))).toBe("vc1");
  });
  it("returns null when the member is not in voice", () => {
    expect(memberVoiceChannelId(member(null))).toBe(null);
    expect(memberVoiceChannelId({})).toBe(null);
    expect(memberVoiceChannelId(null)).toBe(null);
  });
});

describe("sameVoiceChannel", () => {
  it("is true when member and player share a voice channel", () => {
    expect(sameVoiceChannel(member("vc1"), { voiceChannelId: "vc1" })).toBe(true);
  });
  it("is false for a different or missing channel", () => {
    expect(sameVoiceChannel(member("vc2"), { voiceChannelId: "vc1" })).toBe(false);
    expect(sameVoiceChannel(member(null), { voiceChannelId: "vc1" })).toBe(false);
    expect(sameVoiceChannel(member("vc1"), null)).toBe(false);
  });
});
