export async function applyAutomodAction({ message, member, config, reason, cases, logger }) {
  try {
    await message.delete();
  } catch (err) {
    logger.error({ err }, "automod delete failed");
  }

  const botId = message.client.user.id;
  if (config.action === "warn" && member) {
    await cases.createCase({
      guildId: message.guild.id,
      type: "warn",
      targetId: member.id,
      moderatorId: botId,
      reason: `AutoMod: ${reason}`,
    });
  } else if (config.action === "timeout" && member) {
    try {
      await member.timeout(config.timeoutSeconds * 1000, `AutoMod: ${reason}`);
    } catch (err) {
      logger.error({ err }, "automod timeout failed");
    }
    await cases.createCase({
      guildId: message.guild.id,
      type: "timeout",
      targetId: member.id,
      moderatorId: botId,
      reason: `AutoMod: ${reason}`,
      expiresAt: new Date(Date.now() + config.timeoutSeconds * 1000),
    });
  }
}
