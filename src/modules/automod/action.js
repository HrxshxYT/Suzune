import { dmTarget } from "../moderation/helpers.js";
import { infoEmbed } from "../../lib/embeds.js";

// Human-readable phrasing for the DM the offender receives, keyed by action.
const ACTION_PHRASING = {
  warn: "warned",
  timeout: "timed out",
};

export async function applyAutomodAction({
  message,
  member,
  config,
  reason,
  cases,
  logger,
  dmOnAction = false,
}) {
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

  // Notify the offender when the guild opts into action DMs and AutoMod issued a
  // real punishment (warn/timeout). Plain deletes are intentionally silent so a
  // noisy channel doesn't flood a member's DMs.
  const phrasing = ACTION_PHRASING[config.action];
  if (dmOnAction && member && phrasing) {
    await dmTarget(
      member.user ?? member,
      infoEmbed(
        `You were ${phrasing} in ${message.guild.name}`,
        `**Reason:** AutoMod — ${reason}`,
      ),
      logger,
    );
  }
}
