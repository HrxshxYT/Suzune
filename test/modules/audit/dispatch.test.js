import { describe, it, expect, vi } from "vitest";
import { shouldPost, postAudit } from "../../../src/modules/audit/dispatch.js";

describe("shouldPost", () => {
  const base = { enabled: true, channelId: "c1", events: {} };
  it("posts when enabled, has a channel, and the category is not disabled", () => {
    expect(shouldPost(base, "members")).toBe(true);
    expect(shouldPost({ ...base, events: { members: true } }, "members")).toBe(true);
  });
  it("does not post when disabled, channel-less, or the category is off", () => {
    expect(shouldPost({ ...base, enabled: false }, "members")).toBe(false);
    expect(shouldPost({ ...base, channelId: null }, "members")).toBe(false);
    expect(shouldPost({ ...base, events: { members: false } }, "members")).toBe(false);
    expect(shouldPost(null, "members")).toBe(false);
  });
});

describe("postAudit", () => {
  it("sends the embed to the configured channel when allowed", async () => {
    const send = vi.fn(async () => {});
    const channel = { isTextBased: () => true, send };
    const guild = { id: "g1", channels: { fetch: vi.fn(async () => channel) } };
    const ctx = {
      config: { getGuild: vi.fn(async () => ({ audit: { enabled: true, channelId: "c1", events: {} } })) },
      logger: { error: vi.fn() },
    };
    await postAudit(ctx, guild, "members", { title: "x" });
    expect(send).toHaveBeenCalledWith({ embeds: [{ title: "x" }] });
  });

  it("no-ops when the category is disabled", async () => {
    const send = vi.fn(async () => {});
    const guild = { id: "g1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const ctx = {
      config: { getGuild: vi.fn(async () => ({ audit: { enabled: true, channelId: "c1", events: { members: false } } })) },
      logger: { error: vi.fn() },
    };
    await postAudit(ctx, guild, "members", { title: "x" });
    expect(send).not.toHaveBeenCalled();
  });
});
