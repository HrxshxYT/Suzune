export class TicketService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async getConfig(guildId) {
    return this.prisma.ticketConfig.upsert({
      where: { guildId },
      create: { guildId },
      update: {},
    });
  }

  async updateConfig(guildId, data) {
    return this.prisma.ticketConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
  }

  listPanels(guildId) {
    return this.prisma.ticketPanel.findMany({
      where: { guildId },
      include: { categories: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
  }

  getPanel(panelId) {
    return this.prisma.ticketPanel.findUnique({
      where: { id: panelId },
      include: { categories: { orderBy: { position: "asc" } } },
    });
  }

  createPanel(guildId, { name }) {
    return this.prisma.ticketPanel.create({ data: { guildId, name } });
  }

  updatePanel(panelId, data) {
    return this.prisma.ticketPanel.update({ where: { id: panelId }, data });
  }

  async deletePanel(panelId) {
    await this.prisma.ticketPanel.delete({ where: { id: panelId } });
  }

  setPublished(panelId, channelId, messageId) {
    return this.prisma.ticketPanel.update({
      where: { id: panelId },
      data: { channelId, messageId },
    });
  }

  getCategory(categoryId) {
    return this.prisma.ticketCategory.findUnique({ where: { id: categoryId } });
  }

  async addCategory(panelId, data) {
    const count = await this.prisma.ticketCategory.count({ where: { panelId } });
    return this.prisma.ticketCategory.create({
      data: { panelId, position: count, ...data },
    });
  }

  updateCategory(categoryId, data) {
    return this.prisma.ticketCategory.update({ where: { id: categoryId }, data });
  }

  async removeCategory(categoryId) {
    await this.prisma.ticketCategory.delete({ where: { id: categoryId } });
  }

  countOpenForUser(guildId, userId, categoryId) {
    return this.prisma.ticket.count({
      where: { guildId, openerId: userId, categoryId, status: "open" },
    });
  }

  async createTicket({ guildId, panelId, categoryId, openerId, channelId, reason }) {
    return this.prisma.$transaction(async (tx) => {
      // `create` initializes next=2 and this (first) ticket claims #1.
      // `update` increments then returns the new next, so the claimed number is next-1.
      const counter = await tx.ticketCounter.upsert({
        where: { guildId },
        create: { guildId, next: 2 },
        update: { next: { increment: 1 } },
      });
      const number = counter.next - 1;
      return tx.ticket.create({
        data: { guildId, panelId, categoryId, openerId, channelId, reason, number },
      });
    });
  }

  getTicket(ticketId) {
    return this.prisma.ticket.findUnique({ where: { id: ticketId } });
  }

  getTicketByChannel(channelId) {
    return this.prisma.ticket.findUnique({ where: { channelId } });
  }

  setClaim(ticketId, userId) {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { claimedById: userId },
    });
  }

  setStatus(ticketId, status, closedAt) {
    const data = { status };
    if (closedAt !== undefined) data.closedAt = closedAt;
    return this.prisma.ticket.update({ where: { id: ticketId }, data });
  }

  async peekNextNumber(guildId) {
    const c = await this.prisma.ticketCounter.findUnique({ where: { guildId } });
    return c?.next ?? 1;
  }
}
