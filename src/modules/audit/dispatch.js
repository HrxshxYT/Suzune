export function shouldPost(config, category) {
  if (!config?.enabled || !config.channelId) return false;
  return config.events?.[category] !== false; // missing key = enabled
}

export async function postAudit(ctx, guild, category, embed) {
  try {
    const cfg = (await ctx.config.getGuild(guild.id)).audit;
    if (!shouldPost(cfg, category)) return;
    const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    ctx.logger?.error?.({ err, category }, "audit dispatch failed");
  }
}
