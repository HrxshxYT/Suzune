import { describe, it, expect, vi } from "vitest";
import { StatsService, STAT_ANTINUKE_TRIGGERS } from "../../src/core/StatsService.js";

function prismaMock(existing = null) {
  return {
    botStat: {
      upsert: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => existing),
    },
  };
}

describe("StatsService", () => {
  it("increments the antinuke counter via upsert with increment", async () => {
    const prisma = prismaMock();
    const stats = new StatsService(prisma);
    await stats.incrementAntinukeTriggers();
    expect(prisma.botStat.upsert).toHaveBeenCalledWith({
      where: { key: STAT_ANTINUKE_TRIGGERS },
      create: { key: STAT_ANTINUKE_TRIGGERS, value: 1 },
      update: { value: { increment: 1 } },
    });
  });

  it("returns the stored value", async () => {
    const stats = new StatsService(prismaMock({ value: 7 }));
    expect(await stats.getAntinukeTriggers()).toBe(7);
  });

  it("returns 0 when the counter row does not exist yet", async () => {
    const stats = new StatsService(prismaMock(null));
    expect(await stats.getAntinukeTriggers()).toBe(0);
  });
});
