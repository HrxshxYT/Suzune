// Keys for the BotStat singleton counter table.
export const STAT_ANTINUKE_TRIGGERS = "antinukeTriggers";

// Global, cross-shard counters backed by the BotStat table. Every shard shares
// the same database row, so increments accumulate across the whole fleet.
export class StatsService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async increment(key, by = 1) {
    return this.prisma.botStat.upsert({
      where: { key },
      create: { key, value: by },
      update: { value: { increment: by } },
    });
  }

  async get(key) {
    const row = await this.prisma.botStat.findUnique({ where: { key } });
    return row?.value ?? 0;
  }

  incrementAntinukeTriggers(by = 1) {
    return this.increment(STAT_ANTINUKE_TRIGGERS, by);
  }

  getAntinukeTriggers() {
    return this.get(STAT_ANTINUKE_TRIGGERS);
  }
}
