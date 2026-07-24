import { describe, it, expect, vi } from "vitest";
import { handleLogs } from "../../../src/modules/automod/commands/logs.js";

describe("/automod logs", () => {
  it("renders recent hits including dry-run", async () => {
    const ctx = { config: { getAutomodLogs: vi.fn(async () => [
      { source: "nitro", action: "timeout", dryRun: false, heatAfter: 120, userId: "u1", createdAt: new Date() },
      { source: "custom:abc", action: "log-only", dryRun: true, heatAfter: 0, userId: "u2", createdAt: new Date() },
    ]) } };
    const interaction = { guildId: "g", reply: vi.fn() };
    await handleLogs(interaction, ctx);
    const arg = JSON.stringify(interaction.reply.mock.calls[0][0]);
    expect(arg).toMatch(/nitro/);
    expect(arg).toMatch(/dry/i);
  });
});
