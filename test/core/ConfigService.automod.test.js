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

function fakePrisma() {
  const rows = [];
  return {
    guild: { findUnique: vi.fn().mockResolvedValue({ id: "g" }), create: vi.fn(), update: vi.fn() },
    automodRule: {
      findMany: vi.fn(async () => rows),
      create: vi.fn(async ({ data }) => { const r = { id: String(rows.length + 1), ...data }; rows.push(r); return r; }),
      deleteMany: vi.fn(async ({ where }) => { const i = rows.findIndex((x) => x.id === where.id); if (i >= 0) rows.splice(i, 1); return { count: 1 }; }),
      update: vi.fn(async ({ where, data }) => { const r = rows.find((x) => x.id === where.id); Object.assign(r, data); return r; }),
    },
    automodConfig: { upsert: vi.fn() },
  };
}

describe("ConfigService automod rules", () => {
  it("adds and lists rules", async () => {
    const svc = new ConfigService(fakePrisma());
    await svc.addAutomodRule("g", { source: "custom", pattern: "scam", target: "any", weight: 20 });
    const rules = await svc.getAutomodRules("g");
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toBe("scam");
  });
  it("removes a rule", async () => {
    const svc = new ConfigService(fakePrisma());
    const r = await svc.addAutomodRule("g", { source: "custom", pattern: "x", target: "any", weight: 1 });
    await svc.removeAutomodRule("g", r.id);
    expect(await svc.getAutomodRules("g")).toHaveLength(0);
  });
});
