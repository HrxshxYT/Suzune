import { describe, it, expect } from "vitest";
import {
  countMentions,
  hasInvite,
  hasLink,
  isCapsSpam,
  countEmoji,
  isEmojiSpam,
} from "../../../src/modules/automod/filters.js";

describe("countMentions", () => {
  it("sums user and role mentions", () => {
    const message = {
      mentions: {
        users: new Map([
          ["a", 1],
          ["b", 1],
        ]),
        roles: new Map([["r", 1]]),
      },
    };
    expect(countMentions(message)).toBe(3);
  });
});

describe("link/invite filters", () => {
  it("detects discord invites", () => {
    expect(hasInvite("join discord.gg/abcd")).toBe(true);
    expect(hasInvite("nothing here")).toBe(false);
  });
  it("detects external links", () => {
    expect(hasLink("see https://example.com")).toBe(true);
    expect(hasLink("no link")).toBe(false);
  });
});

describe("caps filter", () => {
  it("trips on mostly-uppercase long messages", () => {
    expect(isCapsSpam("STOP YELLING AT ME", { minLength: 8, percent: 70 })).toBe(true);
  });
  it("ignores short messages", () => {
    expect(isCapsSpam("HI", { minLength: 8, percent: 70 })).toBe(false);
  });
  it("ignores normal-case messages", () => {
    expect(isCapsSpam("this is a normal sentence", { minLength: 8, percent: 70 })).toBe(false);
  });
});

describe("emoji filter", () => {
  it("counts custom and unicode emoji", () => {
    expect(countEmoji("hi <:smile:1> 😀 😀")).toBe(3);
  });
  it("trips over the limit", () => {
    expect(isEmojiSpam("😀😀😀😀😀", 4)).toBe(true);
    expect(isEmojiSpam("😀", 4)).toBe(false);
  });
});
