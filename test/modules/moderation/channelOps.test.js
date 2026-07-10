import { describe, it, expect, vi } from "vitest";
import purge from "../../../src/modules/moderation/commands/purge.js";
import slowmode from "../../../src/modules/moderation/commands/slowmode.js";

describe("/purge", () => {
  it("bulk-deletes the requested amount", async () => {
    const bulkDelete = vi.fn(async () => ({ size: 10 }));
    const i = {
      channel: { bulkDelete },
      options: { getInteger: () => 10, getUser: () => null },
      reply: vi.fn(async () => {}),
    };
    await purge.execute(i, { logger: { error: vi.fn() } });
    expect(bulkDelete).toHaveBeenCalledWith(10, true);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("rejects amounts outside 1-100", async () => {
    const i = {
      channel: { bulkDelete: vi.fn() },
      options: { getInteger: () => 500, getUser: () => null },
      reply: vi.fn(async () => {}),
    };
    await purge.execute(i, { logger: { error: vi.fn() } });
    expect(i.channel.bulkDelete).not.toHaveBeenCalled();
  });
});

describe("/slowmode", () => {
  it("sets the channel rate limit from a duration", async () => {
    const setRateLimitPerUser = vi.fn(async () => {});
    const i = {
      channel: { setRateLimitPerUser },
      options: { getString: () => "10s" },
      reply: vi.fn(async () => {}),
    };
    await slowmode.execute(i, { logger: { error: vi.fn() } });
    expect(setRateLimitPerUser).toHaveBeenCalledWith(10);
  });

  it("clears slowmode on 'off'", async () => {
    const setRateLimitPerUser = vi.fn(async () => {});
    const i = {
      channel: { setRateLimitPerUser },
      options: { getString: () => "off" },
      reply: vi.fn(async () => {}),
    };
    await slowmode.execute(i, { logger: { error: vi.fn() } });
    expect(setRateLimitPerUser).toHaveBeenCalledWith(0);
  });
});
