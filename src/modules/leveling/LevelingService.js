export class LevelingService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async addXp(guildId, userId, amount) {
    const existing = await this.prisma.memberLevel.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    const oldXp = existing?.xp ?? 0;
    const row = await this.prisma.memberLevel.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, xp: amount },
      update: { xp: { increment: amount } },
    });
    return { oldXp, newXp: row.xp };
  }

  async getXp(guildId, userId) {
    const row = await this.prisma.memberLevel.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    return row?.xp ?? 0;
  }

  async rankOf(guildId, userId) {
    const xp = await this.getXp(guildId, userId);
    const ahead = await this.prisma.memberLevel.count({
      where: { guildId, xp: { gt: xp } },
    });
    return ahead + 1;
  }

  async leaderboard(guildId, limit) {
    return this.prisma.memberLevel.findMany({
      where: { guildId },
      orderBy: { xp: "desc" },
      take: limit,
    });
  }

  async getRewards(guildId) {
    return this.prisma.levelReward.findMany({
      where: { guildId },
      orderBy: { level: "asc" },
    });
  }

  async addReward(guildId, level, roleId) {
    await this.prisma.levelReward.upsert({
      where: { guildId_level: { guildId, level } },
      create: { guildId, level, roleId },
      update: { roleId },
    });
  }

  async removeReward(guildId, level) {
    await this.prisma.levelReward.deleteMany({ where: { guildId, level } });
  }
}
