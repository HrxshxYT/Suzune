import { describe, it, expect, vi } from "vitest";
import { TicketService } from "../../../src/modules/tickets/TicketService.js";

describe("TicketService", () => {
  it("getConfig upserts a default row", async () => {
    const upsert = vi.fn(async () => ({ guildId: "g1", maxOpenPerUser: 1 }));
    const svc = new TicketService({ ticketConfig: { upsert } });
    const cfg = await svc.getConfig("g1");
    expect(cfg.maxOpenPerUser).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: "g1" }, update: {} }),
    );
  });

  it("listPanels includes categories ordered by position", async () => {
    const findMany = vi.fn(async () => [{ id: "p1", categories: [] }]);
    const svc = new TicketService({ ticketPanel: { findMany } });
    await svc.listPanels("g1");
    expect(findMany).toHaveBeenCalledWith({
      where: { guildId: "g1" },
      include: { categories: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
  });

  it("countOpenForUser counts only open tickets in the category", async () => {
    const count = vi.fn(async () => 2);
    const svc = new TicketService({ ticket: { count } });
    const n = await svc.countOpenForUser("g1", "u1", "cat1");
    expect(n).toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: { guildId: "g1", openerId: "u1", categoryId: "cat1", status: "open" },
    });
  });

  it("createTicket allocates a monotonic number atomically", async () => {
    // fake $transaction: run the callback with a tx that returns incrementing counters
    const counters = { g1: 5 };
    const tx = {
      ticketCounter: {
        upsert: vi.fn(async ({ where }) => {
          counters[where.guildId] = (counters[where.guildId] ?? 0) + 1;
          return { guildId: where.guildId, next: counters[where.guildId] };
        }),
      },
      ticket: {
        create: vi.fn(async ({ data }) => ({ id: "t1", ...data })),
      },
    };
    const prisma = { $transaction: vi.fn(async (fn) => fn(tx)) };
    const svc = new TicketService(prisma);
    const ticket = await svc.createTicket({
      guildId: "g1", panelId: "p1", categoryId: "c1",
      openerId: "u1", channelId: "chan1", reason: "help",
    });
    // counter started at 5 -> upsert increments next to 6 -> claimed number = 6 - 1 = 5
    expect(ticket.number).toBe(5);
    expect(ticket.channelId).toBe("chan1");
    expect(tx.ticket.create).toHaveBeenCalled();
  });

  it("createTicket numbers a fresh guild as #1", async () => {
    const tx = {
      ticketCounter: { upsert: vi.fn(async ({ create }) => ({ ...create })) }, // next: 2
      ticket: { create: vi.fn(async ({ data }) => ({ id: "t1", ...data })) },
    };
    const svc = new TicketService({ $transaction: vi.fn(async (fn) => fn(tx)) });
    const t = await svc.createTicket({
      guildId: "g2", panelId: "p", categoryId: "c", openerId: "u", channelId: "ch", reason: null,
    });
    expect(t.number).toBe(1);
  });

  it("setStatus writes closedAt when provided", async () => {
    const update = vi.fn(async ({ data }) => ({ id: "t1", ...data }));
    const svc = new TicketService({ ticket: { update } });
    const closedAt = new Date();
    await svc.setStatus("t1", "closed", closedAt);
    expect(update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "closed", closedAt },
    });
  });

  it("peekNextNumber returns the counter's next value", async () => {
    const findUnique = vi.fn(async () => ({ next: 7 }));
    const svc = new TicketService({ ticketCounter: { findUnique } });
    const n = await svc.peekNextNumber("g1");
    expect(n).toBe(7);
    expect(findUnique).toHaveBeenCalledWith({ where: { guildId: "g1" } });
  });

  it("peekNextNumber defaults to 1 when no counter exists yet", async () => {
    const findUnique = vi.fn(async () => null);
    const svc = new TicketService({ ticketCounter: { findUnique } });
    const n = await svc.peekNextNumber("g1");
    expect(n).toBe(1);
  });
});
