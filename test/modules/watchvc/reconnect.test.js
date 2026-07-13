import { describe, it, expect } from "vitest";
import {
  shouldReturnToPost,
  backoffMs,
  MAX_RECONNECT_ATTEMPTS,
} from "../../../src/modules/watchvc/reconnect.js";

describe("shouldReturnToPost", () => {
  it("returns true when moved off the configured channel while enabled", () => {
    expect(shouldReturnToPost({ enabled: true, configuredChannelId: "c1", currentChannelId: "c2" })).toBe(true);
    expect(shouldReturnToPost({ enabled: true, configuredChannelId: "c1", currentChannelId: null })).toBe(true);
  });
  it("returns false when already in the configured channel, disabled, or unconfigured", () => {
    expect(shouldReturnToPost({ enabled: true, configuredChannelId: "c1", currentChannelId: "c1" })).toBe(false);
    expect(shouldReturnToPost({ enabled: false, configuredChannelId: "c1", currentChannelId: null })).toBe(false);
    expect(shouldReturnToPost({ enabled: true, configuredChannelId: null, currentChannelId: null })).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows exponentially and caps", () => {
    expect(backoffMs(0)).toBe(5000);
    expect(backoffMs(1)).toBe(10000);
    expect(backoffMs(2)).toBe(20000);
    expect(backoffMs(10)).toBe(60000);
  });
  it("exposes a max attempt count", () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(5);
  });
});
