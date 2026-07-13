import { describe, it, expect, vi } from "vitest";
import { Events } from "discord.js";
import ready from "../../../src/modules/watchvc/events/ready.js";
import vsu from "../../../src/modules/watchvc/events/voiceStateUpdate.js";
import add from "../../../src/modules/watchvc/events/guildMemberAdd.js";
import remove from "../../../src/modules/watchvc/events/guildMemberRemove.js";

describe("watchvc events", () => {
  it("ready restores all guards on startup", async () => {
    const ctx = { watchvc: { restoreAll: vi.fn(async () => {}) }, logger: { info: vi.fn() } };
    expect(ready.name).toBe(Events.ClientReady);
    expect(ready.once).toBe(true);
    await ready.execute(ctx, {});
    expect(ctx.watchvc.restoreAll).toHaveBeenCalled();
  });

  it("voiceStateUpdate forwards to the service", async () => {
    const ctx = { watchvc: { handleVoiceStateUpdate: vi.fn(async () => {}) } };
    expect(vsu.name).toBe(Events.VoiceStateUpdate);
    await vsu.execute(ctx, { a: 1 }, { b: 2 });
    expect(ctx.watchvc.handleVoiceStateUpdate).toHaveBeenCalledWith({ a: 1 }, { b: 2 });
  });

  it("member add/remove refresh the guild status", async () => {
    const ctx = { watchvc: { refreshStatus: vi.fn() } };
    expect(add.name).toBe(Events.GuildMemberAdd);
    expect(remove.name).toBe(Events.GuildMemberRemove);
    add.execute(ctx, { guild: { id: "g1" } });
    remove.execute(ctx, { guild: { id: "g1" } });
    expect(ctx.watchvc.refreshStatus).toHaveBeenCalledWith("g1");
    expect(ctx.watchvc.refreshStatus).toHaveBeenCalledTimes(2);
  });
});
