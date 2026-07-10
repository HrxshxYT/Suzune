import { describe, it, expect } from "vitest";
import { isWhitelisted, getThreshold } from "../../../src/modules/antinuke/config.js";

const member = (id, roleIds = []) => ({
  id,
  roles: { cache: new Map(roleIds.map((r) => [r, { id: r }])) },
});

describe("isWhitelisted", () => {
  const wl = [
    { targetId: "u1", type: "user" },
    { targetId: "r1", type: "role" },
  ];
  it("matches a whitelisted user", () => {
    expect(isWhitelisted(member("u1"), wl)).toBe(true);
  });
  it("matches a member holding a whitelisted role", () => {
    expect(isWhitelisted(member("u9", ["r1"]), wl)).toBe(true);
  });
  it("rejects a non-whitelisted member and a null member", () => {
    expect(isWhitelisted(member("u9"), wl)).toBe(false);
    expect(isWhitelisted(null, wl)).toBe(false);
  });
});

describe("getThreshold", () => {
  it("returns defaults when there is no override", () => {
    const t = getThreshold({ thresholds: {} }, "channelDelete");
    expect(t).toEqual({ limit: 3, windowSec: 10, enabled: true });
  });
  it("merges a per-guild override over defaults", () => {
    const t = getThreshold({ thresholds: { channelDelete: { limit: 2 } } }, "channelDelete");
    expect(t).toEqual({ limit: 2, windowSec: 10, enabled: true });
  });
});
