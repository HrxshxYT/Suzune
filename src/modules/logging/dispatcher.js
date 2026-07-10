export function resolveLogChannelId(loggingConfig, category) {
  if (!loggingConfig) return null;
  const disabled = loggingConfig.disabled ?? [];
  if (Array.isArray(disabled) && disabled.includes(category)) return null;
  return loggingConfig[category] ?? null;
}

export async function dispatchLog({ guild, loggingConfig, category, embed, logger }) {
  const channelId = resolveLogChannelId(loggingConfig, category);
  if (!channelId) return false;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] });
      return true;
    }
  } catch (err) {
    logger?.error?.({ err, channelId, category }, "log dispatch failed");
  }
  return false;
}

export async function logEvent(ctx, guild, category, embed) {
  const guildConfig = await ctx.config.getGuild(guild.id);
  return dispatchLog({ guild, loggingConfig: guildConfig.logging, category, embed, logger: ctx.logger });
}
