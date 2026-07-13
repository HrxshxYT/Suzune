import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", watchVc: null })),
      create: vi.fn(async ({ data }) => ({ ...data, watchVc: null })),
    },
    watchVcConfig: { upsert: vi.fn(async ({ create, update }) => ({ ...create, ...update })) },
  };
}

describe("ConfigService watchVc", () => {
  it("upserts watch-vc config and invalidates cache", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    await svc.updateWatchVc("g1", { channelId: "c1", enabled: true });
    expect(prisma.watchVcConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: "g1" } }),
    );
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(2);
  });
});
