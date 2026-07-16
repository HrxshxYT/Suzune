import { describe, it, expect, vi } from "vitest";
import { isStaff, handleTicketInteraction } from "../../../src/modules/tickets/router.js";

const perms = (has) => ({ has: () => has });

describe("isStaff", () => {
  const category = { staffRoleIds: ["r1"] };
  it("true for Administrator/ManageChannels", () => {
    expect(isStaff({ permissions: perms(true), roles: { cache: { hasAny: () => false } } }, category)).toBe(true);
  });
  it("true when holding a staff role", () => {
    expect(isStaff({ permissions: perms(false), roles: { cache: { hasAny: (...ids) => ids.includes("r1") } } }, category)).toBe(true);
  });
  it("false otherwise", () => {
    expect(isStaff({ permissions: perms(false), roles: { cache: { hasAny: () => false } } }, category)).toBe(false);
  });
});

describe("handleTicketInteraction", () => {
  it("routes the open select to the open handler path (no ticket load)", async () => {
    const ctx = { tickets: { getCategory: vi.fn(async () => ({ id: "c1", reasonPrompt: null, namePrefix: "t", welcomeMessage: "hi {mention}", staffRoleIds: [], discordCategoryId: null })), getConfig: vi.fn(async () => ({ maxOpenPerUser: 0 })), countOpenForUser: vi.fn(async () => 0), peekNextNumber: vi.fn(async () => 1), createTicket: vi.fn(async () => ({ id: "t1", number: 1, channelId: "c" })) }, logger: { error: vi.fn() } };
    const created = { id: "c", name: "t-1", setName: vi.fn(async () => ({})), send: vi.fn(async () => ({})) };
    const i = {
      isMessageComponent: () => true, isModalSubmit: () => false, isStringSelectMenu: () => true,
      customId: "ticket:open:p1", values: ["c1"], user: { id: "u1" }, guildId: "g1",
      deferred: false, replied: false,
      guild: { roles: { everyone: { id: "e" } }, members: { me: { permissions: perms(true) } }, channels: { create: vi.fn(async () => created) } },
      deferReply: vi.fn(async function () { this.deferred = true; return {}; }),
      editReply: vi.fn(async () => ({})),
      reply: vi.fn(async () => ({})),
    };
    await handleTicketInteraction(i, ctx);
    expect(i.guild.channels.create).toHaveBeenCalled();
  });

  it("rejects a staff-only action from a non-staff caller", async () => {
    const ctx = {
      tickets: {
        getTicket: vi.fn(async () => ({ id: "t1", categoryId: "c1", channelId: "ch" })),
        getCategory: vi.fn(async () => ({ staffRoleIds: ["r1"] })),
      },
      logger: { error: vi.fn() },
    };
    const i = {
      isMessageComponent: () => true, isModalSubmit: () => false,
      customId: "ticket:delete:t1",
      member: { permissions: perms(false), roles: { cache: { hasAny: () => false } } },
      reply: vi.fn(async () => ({})),
    };
    await handleTicketInteraction(i, ctx);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("no-ops safely on an unknown ticket kind", async () => {
    const i = { isMessageComponent: () => true, isModalSubmit: () => false, customId: "ticket:bogus:x", reply: vi.fn(async () => ({})) };
    await handleTicketInteraction(i, { tickets: {}, logger: { error: vi.fn() } });
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
