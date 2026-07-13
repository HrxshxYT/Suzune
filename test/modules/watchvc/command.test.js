import { describe, it, expect, vi } from "vitest";
import cmd from "../../../src/modules/watchvc/commands/watchvc.js";

describe("/watchvc command", () => {
  it("is named watchvc, describes the guard feature, and is admin-gated", () => {
    const json = cmd.data.toJSON();
    expect(json.name).toBe("watchvc");
    expect(json.description).toMatch(/guard/i);
    expect(cmd.data.default_member_permissions).toBeTruthy();
  });

  it("execute delegates to the panel", async () => {
    // execute simply forwards; assert it invokes without throwing given a stub ctx.
    const interaction = { guildId: "g1", user: { id: "u1" }, reply: vi.fn(async () => {}), fetchReply: vi.fn(async () => ({})), editReply: vi.fn(async () => {}) };
    const ctx = {
      config: { getGuild: vi.fn(async () => ({ watchVc: null })) },
      awaitFn: vi.fn(async () => null), // immediate timeout → panel closes
    };
    await expect(cmd.execute(interaction, ctx)).resolves.toBeUndefined();
    expect(interaction.reply).toHaveBeenCalled();
  });
});
