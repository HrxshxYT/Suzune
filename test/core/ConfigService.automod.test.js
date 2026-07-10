import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({
        id: "g1",
        antinuke: null,
        automod: null,
        logging: null,
        modRoles: [],
        whitelist: [],
      })),
      create: vi.fn(async ({ data }) => ({ ...data })),
    },
    automodConfig: {
      upsert: vi.fn(async ({ where, create, update }) => ({
        guildId: where.guildId,
        ...create,
        ...update,
      })),
    },
  };
}

describe("ConfigService.updateAutomod", () => {
  it("upserts automod config and invalidates cache", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    const row = await svc.updateAutomod("g1", { enabled: true, action: "timeout" });
    expect(row.enabled).toBe(true);
    expect(prisma.automodConfig.upsert).toHaveBeenCalled();
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(2); // cache invalidated
  });
});
