import { AttachmentBuilder } from "discord.js";
import { computeMetrics } from "./metrics.js";
import { buildDashboardCard } from "./card.js";
import { buildDashboardEmbeds, CARD_FILENAME } from "./render.js";

// Best-effort fetch of guild webhooks; returns [] when the bot lacks the
// Manage Webhooks permission or the call fails, so the dashboard still renders.
async function safeWebhooks(guild) {
  try {
    const hooks = await guild.fetchWebhooks();
    return [...hooks.values()];
  } catch {
    return [];
  }
}

// Renders the current dashboard snapshot for a guild into a message payload.
export async function buildDashboardPayload(guild, ctx) {
  const config = await ctx.config.getGuild(guild.id);
  const webhooks = await safeWebhooks(guild);
  const metrics = computeMetrics({ guild, config, webhooks });
  const png = buildDashboardCard(metrics, { guildName: guild.name });
  const file = new AttachmentBuilder(png, { name: CARD_FILENAME });
  return { embeds: buildDashboardEmbeds(metrics, { guildName: guild.name }), files: [file] };
}

// Starts (or restarts) the live refresh loop for a dashboard message. On each
// tick it re-renders and replaces the attached image (attachments: [] clears
// the previous one).
export function beginDashboardLoop(ctx, message, guild) {
  ctx.dashboards.start(message, async () => ({
    ...(await buildDashboardPayload(guild, ctx)),
    attachments: [],
  }));
}

// Persists a dashboard message and starts its loop.
export async function registerDashboard(ctx, message, guild) {
  await ctx.prisma.dashboard.upsert({
    where: { id: message.id },
    create: { id: message.id, guildId: guild.id, channelId: message.channelId },
    update: { guildId: guild.id, channelId: message.channelId },
  });
  beginDashboardLoop(ctx, message, guild);
}

// After a restart, re-attach the refresh loop to every persisted dashboard that
// lives on this shard. Rows for guilds this shard doesn't own are left alone
// (another shard owns them); rows whose message/channel is truly gone are
// pruned so they don't linger forever.
export async function restoreDashboards(ctx) {
  const { client, prisma, logger } = ctx;
  let rows = [];
  try {
    rows = await prisma.dashboard.findMany();
  } catch (err) {
    logger?.error?.({ err }, "failed to load persisted dashboards");
    return 0;
  }

  let restored = 0;
  for (const row of rows) {
    if (!client.guilds.cache.has(row.guildId)) continue; // owned by another shard
    try {
      const channel = await client.channels.fetch(row.channelId);
      const message = await channel.messages.fetch(row.id);
      beginDashboardLoop(ctx, message, channel.guild);
      restored += 1;
    } catch {
      // Message or channel is gone on our shard — drop the row.
      await prisma.dashboard.deleteMany({ where: { id: row.id } }).catch(() => {});
    }
  }
  logger?.info?.({ restored }, "dashboards restored");
  return restored;
}
