import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { renderWelcome, createTicketChannel, inTicketControls } from "../../../../src/modules/tickets/lifecycle/open.js";

describe("renderWelcome", () => {
  it("substitutes the opener mention", () => {
    expect(renderWelcome("Hi {mention}!", { openerId: "u1" })).toBe("Hi <@u1>!");
  });
});

describe("inTicketControls", () => {
  it("builds three persistent buttons carrying the ticket id", () => {
    const row = inTicketControls("t9");
    const ids = row.components.map((c) => c.data.custom_id);
    expect(ids).toEqual(["ticket:claim:t9", "ticket:members:t9", "ticket:close:t9"]);
  });
});

describe("createTicketChannel", () => {
  const category = {
    id: "c1", label: "General", namePrefix: "ticket",
    welcomeMessage: "Hi {mention}", staffRoleIds: ["staff1"],
    discordCategoryId: "parent1",
  };

  function makeInteraction() {
    const created = { id: "chan1", name: "ticket-1", send: vi.fn(async () => ({})) };
    return {
      guildId: "g1",
      user: { id: "u1" },
      guild: {
        roles: { everyone: { id: "everyone" } },
        members: { me: { permissions: { has: () => true } } },
        channels: { create: vi.fn(async () => created) },
      },
      reply: vi.fn(async () => ({})),
      _created: created,
    };
  }

  it("enforces the per-user open limit", async () => {
    const i = makeInteraction();
    const ctx = {
      tickets: {
        getConfig: vi.fn(async () => ({ maxOpenPerUser: 1 })),
        countOpenForUser: vi.fn(async () => 1),
      },
      logger: { error: vi.fn() },
    };
    await createTicketChannel({ interaction: i, ctx, panelId: "p1", category, reason: null });
    expect(i.guild.channels.create).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("creates a channel + ticket row and posts the welcome", async () => {
    const i = makeInteraction();
    const ctx = {
      tickets: {
        getConfig: vi.fn(async () => ({ maxOpenPerUser: 0 })),
        countOpenForUser: vi.fn(async () => 0),
        createTicket: vi.fn(async () => ({ id: "t1", number: 1, channelId: "chan1" })),
        peekNextNumber: vi.fn(async () => 1),
      },
      logger: { error: vi.fn() },
    };
    await createTicketChannel({ interaction: i, ctx, panelId: "p1", category, reason: "help me" });
    expect(i.guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ticket-1", parent: "parent1" }),
    );
    expect(ctx.tickets.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: "g1", categoryId: "c1", openerId: "u1", channelId: "chan1", reason: "help me" }),
    );
    expect(i._created.send).toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("blocks opening when the bot lacks Manage Roles even with Manage Channels", async () => {
    const i = makeInteraction();
    i.guild.members.me.permissions.has = (flag) => flag !== PermissionFlagsBits.ManageRoles;
    const ctx = {
      tickets: {
        getConfig: vi.fn(async () => ({ maxOpenPerUser: 0 })),
        countOpenForUser: vi.fn(async () => 0),
        createTicket: vi.fn(async () => ({ id: "t1", number: 1, channelId: "chan1" })),
        peekNextNumber: vi.fn(async () => 1),
      },
      logger: { error: vi.fn() },
    };
    await createTicketChannel({ interaction: i, ctx, panelId: "p1", category, reason: null });
    expect(i.guild.channels.create).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
