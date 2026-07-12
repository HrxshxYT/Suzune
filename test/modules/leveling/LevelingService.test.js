import { describe, it, expect, vi } from "vitest";
import { LevelingService } from "../../../src/modules/leveling/LevelingService.js";

describe("LevelingService", () => {
  it("addXp upserts and returns old/new totals", async () => {
    const prisma = {
      memberLevel: {
        findUnique: vi.fn(async () => ({ xp: 40 })),
        upsert: vi.fn(async () => ({ xp: 60 })),
      },
    };
    const svc = new LevelingService(prisma);
    const out = await svc.addXp("g1", "u1", 20);
    expect(out).toEqual({ oldXp: 40, newXp: 60 });
    expect(prisma.memberLevel.upsert).toHaveBeenCalledWith({
      where: { guildId_userId: { guildId: "g1", userId: "u1" } },
      create: { guildId: "g1", userId: "u1", xp: 20 },
      update: { xp: { increment: 20 } },
    });
  });

  it("addXp treats a missing row as 0 old xp", async () => {
    const prisma = {
      memberLevel: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({ xp: 20 })),
      },
    };
    const svc = new LevelingService(prisma);
    expect(await svc.addXp("g1", "u1", 20)).toEqual({ oldXp: 0, newXp: 20 });
  });

  it("rankOf counts members with strictly more xp, plus one", async () => {
    const prisma = {
      memberLevel: {
        findUnique: vi.fn(async () => ({ xp: 100 })),
        count: vi.fn(async () => 3),
      },
    };
    const svc = new LevelingService(prisma);
    expect(await svc.rankOf("g1", "u1")).toBe(4);
    expect(prisma.memberLevel.count).toHaveBeenCalledWith({
      where: { guildId: "g1", xp: { gt: 100 } },
    });
  });
});
