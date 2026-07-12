import { describe, it, expect, vi } from "vitest";
import listener from "../../../src/modules/leveling/events/messageCreate.js";

function fakeMessage() {
  return {
    guild: { id: "g1" },
    author: { id: "u1", bot: false },
  };
}

describe("leveling messageCreate listener", () => {
  it("never throws when ctx.config.getGuild rejects, and logs the error", async () => {
    const message = fakeMessage();
    const ctx = {
      config: { getGuild: vi.fn(async () => { throw new Error("db down"); }) },
      logger: { error: vi.fn(), warn: vi.fn() },
      leveling: { addXp: vi.fn() },
      cooldowns: { check: vi.fn() },
    };

    await expect(listener.execute(ctx, message)).resolves.not.toThrow();
    expect(ctx.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "leveling messageCreate failed",
    );
  });

  it("returns early without touching leveling when config is disabled", async () => {
    const message = fakeMessage();
    const ctx = {
      config: { getGuild: vi.fn(async () => ({ leveling: { enabled: false } })) },
      logger: { error: vi.fn(), warn: vi.fn() },
      leveling: { addXp: vi.fn() },
      cooldowns: { check: vi.fn() },
    };

    await listener.execute(ctx, message);
    expect(ctx.leveling.addXp).not.toHaveBeenCalled();
    expect(ctx.logger.error).not.toHaveBeenCalled();
  });
});
