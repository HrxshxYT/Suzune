import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({
        id: "g1",
        antinuke: null,
        logging: null,
        modRoles: [],
        whitelist: [],
      })),
      create: vi.fn(async ({ data }) => ({ ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    loggingConfig: {
      upsert: vi.fn(async ({ where, create, update }) => ({
        guildId: where.guildId,
        ...create,
        ...update,
      })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    modRole: {
      upsert: vi.fn(async ({ create }) => ({ ...create })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    antinukeConfig: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    whitelist: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    welcomeConfig: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    autoRole: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    auditConfig: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      upsert: vi.fn(async ({ create, update }) => ({ ...create, ...update })),
    },
  };
}

describe("ConfigService config methods", () => {
  it("upserts logging config", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    const row = await svc.updateLogging("g1", { memberJoinLeave: "c1" });
    expect(row.memberJoinLeave).toBe("c1");
    expect(prisma.loggingConfig.upsert).toHaveBeenCalled();
  });

  it("adds and removes mod roles", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    const r = await svc.addModRole("g1", "role1");
    expect(r).toMatchObject({ guildId: "g1", roleId: "role1" });
    await svc.removeModRole("g1", "role1");
    expect(prisma.modRole.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g1", roleId: "role1" },
    });
  });

  it("upserts audit config", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    const row = await svc.updateAudit("g1", { enabled: true, channelId: "c9" });
    expect(prisma.auditConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: "g1" } }),
    );
    expect(row.channelId).toBe("c9");
  });

  it("resets all guild config", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.resetGuildConfig("g1");
    expect(prisma.antinukeConfig.deleteMany).toHaveBeenCalledWith({ where: { guildId: "g1" } });
    expect(prisma.loggingConfig.deleteMany).toHaveBeenCalled();
    expect(prisma.modRole.deleteMany).toHaveBeenCalled();
    expect(prisma.whitelist.deleteMany).toHaveBeenCalled();
    expect(prisma.welcomeConfig.deleteMany).toHaveBeenCalled();
    expect(prisma.autoRole.deleteMany).toHaveBeenCalled();
    expect(prisma.auditConfig.deleteMany).toHaveBeenCalled();
    expect(prisma.guild.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dmOnAction: true, muteRoleId: null }),
      }),
    );
  });
});
