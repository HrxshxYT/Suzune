const INCLUDE = {
  antinuke: true,
  automod: true,
  logging: true,
  modRoles: true,
  whitelist: true,
  welcome: true,
  autoRoles: true,
  audit: true,
  leveling: true,
  watchVc: true,
};

export class ConfigService {
  constructor(prisma) {
    this.prisma = prisma;
    this.cache = new Map();
  }

  async getGuild(guildId) {
    if (this.cache.has(guildId)) {
      return this.cache.get(guildId);
    }
    let row = await this.prisma.guild.findUnique({ where: { id: guildId }, include: INCLUDE });
    if (!row) {
      row = await this.prisma.guild.create({ data: { id: guildId }, include: INCLUDE });
    }
    this.cache.set(guildId, row);
    return row;
  }

  async updateGuild(guildId, data) {
    const row = await this.prisma.guild.update({
      where: { id: guildId },
      data,
      include: INCLUDE,
    });
    this.cache.set(guildId, row);
    return row;
  }

  async updateAntinuke(guildId, data) {
    await this.getGuild(guildId); // ensure the parent guild row exists
    const row = await this.prisma.antinukeConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async updateAutomod(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.automodConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async getAutomodRules(guildId) {
    return this.prisma.automodRule.findMany({ where: { guildId } });
  }

  async addAutomodRule(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.automodRule.create({ data: { guildId, ...data } });
    this.invalidate(guildId);
    return row;
  }

  async removeAutomodRule(guildId, id) {
    await this.prisma.automodRule.deleteMany({ where: { guildId, id } });
    this.invalidate(guildId);
  }

  async editAutomodRule(guildId, id, data) {
    const row = await this.prisma.automodRule.update({ where: { id }, data });
    this.invalidate(guildId);
    return row;
  }

  async disableAutomodRule(guildId, id, reason) {
    const row = await this.prisma.automodRule.update({
      where: { id },
      data: { enabled: false, disabledReason: reason },
    });
    this.invalidate(guildId);
    return row;
  }

  async getPackStates(guildId) {
    return this.prisma.automodPackState.findMany({ where: { guildId } });
  }

  async setPackState(guildId, packId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.automodPackState.upsert({
      where: { guildId_packId: { guildId, packId } },
      create: { guildId, packId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async addAutomodLog(guildId, data) {
    return this.prisma.automodLog.create({ data: { guildId, ...data } });
  }

  async getAutomodLogs(guildId, limit = 20) {
    return this.prisma.automodLog.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async updateWelcome(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.welcomeConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async updateAudit(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.auditConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async updateLeveling(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.levelingConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async updateWatchVc(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.watchVcConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async addAutoRole(guildId, roleId) {
    await this.getGuild(guildId);
    const row = await this.prisma.autoRole.upsert({
      where: { guildId_roleId: { guildId, roleId } },
      create: { guildId, roleId },
      update: {},
    });
    this.invalidate(guildId);
    return row;
  }

  async removeAutoRole(guildId, roleId) {
    await this.prisma.autoRole.deleteMany({ where: { guildId, roleId } });
    this.invalidate(guildId);
  }

  async addWhitelist(guildId, targetId, type, addedById) {
    await this.getGuild(guildId);
    const row = await this.prisma.whitelist.upsert({
      where: { guildId_targetId: { guildId, targetId } },
      create: { guildId, targetId, type, addedById },
      update: { type },
    });
    this.invalidate(guildId);
    return row;
  }

  async removeWhitelist(guildId, targetId) {
    await this.prisma.whitelist.deleteMany({ where: { guildId, targetId } });
    this.invalidate(guildId);
  }

  async updateLogging(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.loggingConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async addModRole(guildId, roleId) {
    await this.getGuild(guildId);
    const row = await this.prisma.modRole.upsert({
      where: { guildId_roleId: { guildId, roleId } },
      create: { guildId, roleId },
      update: {},
    });
    this.invalidate(guildId);
    return row;
  }

  async removeModRole(guildId, roleId) {
    await this.prisma.modRole.deleteMany({ where: { guildId, roleId } });
    this.invalidate(guildId);
  }

  async resetGuildConfig(guildId) {
    await this.prisma.antinukeConfig.deleteMany({ where: { guildId } });
    await this.prisma.loggingConfig.deleteMany({ where: { guildId } });
    await this.prisma.modRole.deleteMany({ where: { guildId } });
    await this.prisma.whitelist.deleteMany({ where: { guildId } });
    await this.prisma.welcomeConfig.deleteMany({ where: { guildId } });
    await this.prisma.autoRole.deleteMany({ where: { guildId } });
    await this.prisma.auditConfig.deleteMany({ where: { guildId } });
    await this.prisma.levelingConfig.deleteMany({ where: { guildId } });
    await this.prisma.levelReward.deleteMany({ where: { guildId } });
    await this.prisma.watchVcConfig.deleteMany({ where: { guildId } });
    await this.prisma.guild.update({
      where: { id: guildId },
      data: { dmOnAction: true, muteRoleId: null, modLogEnabled: false },
    });
    this.invalidate(guildId);
  }

  invalidate(guildId) {
    this.cache.delete(guildId);
  }
}
