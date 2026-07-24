import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import lockserver from "../../../src/modules/lockdown/commands/lockserver.js";
import unlockserver from "../../../src/modules/lockdown/commands/unlockserver.js";

describe("lockserver command metadata", () => {
  it("registers subcommands and requires ManageGuild/Administrator", () => {
    const json = lockserver.data.toJSON();
    expect(json.name).toBe("lockserver");
    const subs = json.options.map((o) => o.name).sort();
    expect(subs).toEqual(["channels", "full", "invites", "joins", "panic", "status", "voice"]);
    expect(lockserver.permissions).toContain(PermissionFlagsBits.Administrator);
    expect(lockserver.permissions).toContain(PermissionFlagsBits.ManageGuild);
  });

  it("unlockserver is named and gated the same way", () => {
    expect(unlockserver.data.toJSON().name).toBe("unlockserver");
    expect(unlockserver.permissions).toContain(PermissionFlagsBits.ManageGuild);
  });
});

describe("lockserver status subcommand", () => {
  it("replies with status without starting a lockdown", async () => {
    const reply = vi.fn(async () => {});
    const interaction = {
      guildId: "g1",
      guild: { id: "g1" },
      options: { getSubcommand: () => "status", getString: () => null },
      user: { id: "admin" },
      reply,
    };
    const ctx = {
      logger: console,
      lockdown: { status: vi.fn(async () => null), start: vi.fn() },
      config: { getGuild: vi.fn(async () => ({ modRoles: [], antinuke: null })) },
    };
    await lockserver.execute(interaction, ctx);
    expect(ctx.lockdown.status).toHaveBeenCalledWith("g1");
    expect(ctx.lockdown.start).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalled();
  });

  it("a tier subcommand that is already active reports status, does not re-lock", async () => {
    const reply = vi.fn(async () => {});
    const deferReply = vi.fn(async () => {});
    const editReply = vi.fn(async () => {});
    const interaction = {
      guildId: "g1",
      guild: { id: "g1" },
      options: {
        getSubcommand: () => "channels",
        getString: (n) => (n === "reason" ? "raid" : null),
        getChannel: () => null,
      },
      user: { id: "admin" },
      reply,
      deferReply,
      editReply,
    };
    const active = { tier: "channels", status: "active", startedById: "admin", startedAt: new Date(), reason: "r" };
    const ctx = {
      logger: console,
      lockdown: {
        status: vi.fn(async () => active),
        start: vi.fn(async () => ({ ok: false, alreadyActive: true, state: active })),
      },
      config: { getGuild: vi.fn(async () => ({ modRoles: [], antinuke: null })) },
    };
    await lockserver.execute(interaction, ctx);
    // Already deferred by the time we learn it's active, so the report goes
    // through editReply, not reply (calling reply() after deferReply() would
    // throw against the real Discord API).
    expect(deferReply).toHaveBeenCalled();
    expect(editReply).toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });
});
