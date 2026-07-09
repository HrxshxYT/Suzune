import { describe, it, expect, vi } from "vitest";
import { runSafely } from "../../src/core/Errors.js";

function fakeInteraction() {
  return {
    replied: false,
    deferred: false,
    reply: vi.fn(async function () {
      this.replied = true;
    }),
    followUp: vi.fn(async () => {}),
  };
}
const logger = { error: vi.fn() };

describe("runSafely", () => {
  it("returns true and does not reply when fn succeeds", async () => {
    const interaction = fakeInteraction();
    const ok = await runSafely({ fn: async () => {}, interaction, logger });
    expect(ok).toBe(true);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("catches errors, logs, and replies ephemerally", async () => {
    const interaction = fakeInteraction();
    const ok = await runSafely({
      fn: async () => {
        throw new Error("boom");
      },
      interaction,
      logger,
    });
    expect(ok).toBe(false);
    expect(logger.error).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("uses followUp when the interaction was already replied", async () => {
    const interaction = fakeInteraction();
    interaction.replied = true;
    await runSafely({
      fn: async () => {
        throw new Error("boom");
      },
      interaction,
      logger,
    });
    expect(interaction.followUp).toHaveBeenCalled();
  });
});
