import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function fakePrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", leveling: null })),
      create: vi.fn(async () => ({ id: "g1", leveling: null })),
    },
    levelingConfig: { upsert: vi.fn(async (args) => ({ guildId: "g1", ...args.create, ...args.update })) },
  };
}

describe("ConfigService.updateLeveling", () => {
  it("upserts the leveling config and invalidates the cache", async () => {
    const prisma = fakePrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1"); // populate cache
    await svc.updateLeveling("g1", { enabled: true, xpMin: 20 });
    expect(prisma.levelingConfig.upsert).toHaveBeenCalledWith({
      where: { guildId: "g1" },
      create: { guildId: "g1", enabled: true, xpMin: 20 },
      update: { enabled: true, xpMin: 20 },
    });
    expect(svc.cache.has("g1")).toBe(false); // invalidated
  });
});
