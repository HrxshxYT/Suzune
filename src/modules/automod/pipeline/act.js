import { PermissionFlagsBits } from "discord.js";
import { dmTarget } from "../../moderation/helpers.js";
import { infoEmbed } from "../../../lib/embeds.js";

const DM_PHRASING = { warn: "warned", timeout: "timed out", kick: "kicked", ban: "banned", quarantine: "quarantined" };

export function isExempt({ member, channelId, config }) {
  if (member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  const exemptRoles = config.exemptRoles ?? [];
  if (member && exemptRoles.some((r) => member.roles.cache.has(r))) return true;
  if ((config.exemptChannels ?? []).includes(channelId)) return true;
  return false;
}

async function punish(action, { message, member, config, guildConfig, reason, cases, logger }) {
  const guildId = message.guild.id;
  const botId = message.client.user.id;
  const base = { guildId, targetId: member.id, moderatorId: botId, reason: `AutoMod: ${reason}` };
  switch (action) {
    case "warn":
      await cases.createCase({ ...base, type: "warn" });
      return "warn";
    case "timeout": {
      const ok = await member
        .timeout((config.timeoutSeconds ?? 300) * 1000, base.reason)
        .then(() => true)
        .catch((err) => {
          logger.error?.({ err, guildId }, "automod timeout failed");
          return false;
        });
      if (!ok) return null;
      await cases.createCase({ ...base, type: "timeout", expiresAt: new Date(Date.now() + (config.timeoutSeconds ?? 300) * 1000) });
      return "timeout";
    }
    case "kick": {
      const ok = await member
        .kick(base.reason)
        .then(() => true)
        .catch((err) => {
          logger.error?.({ err, guildId }, "automod kick failed");
          return false;
        });
      if (!ok) return null;
      await cases.createCase({ ...base, type: "kick" });
      return "kick";
    }
    case "ban": {
      const ok = await message.guild.bans
        .create(member.id, { reason: base.reason })
        .then(() => true)
        .catch((err) => {
          logger.error?.({ err, guildId }, "automod ban failed");
          return false;
        });
      if (!ok) return null;
      await cases.createCase({ ...base, type: "ban" });
      return "ban";
    }
    case "quarantine": {
      const roleId = guildConfig?.antinuke?.quarantineRoleId;
      if (!roleId) {
        logger.warn?.({ guildId }, "automod quarantine: no quarantine role configured; skipping");
        return null;
      }
      const ok = await member.roles
        .set([roleId], base.reason)
        .then(() => true)
        .catch((err) => {
          logger.error?.({ err, guildId }, "automod quarantine failed");
          return false;
        });
      if (!ok) return null;
      await cases.createCase({ ...base, type: "quarantine" });
      return "quarantine";
    }
    default:
      return null;
  }
}

export async function act({ message, member, config, guildConfig, deleteMessage, heatAfter, cases, logger }) {
  if (deleteMessage) {
    try {
      await message.delete();
    } catch (err) {
      logger.error?.({ err }, "automod delete failed");
    }
  }

  let memberAction = null;
  if (member && heatAfter >= config.heatThreshold) {
    memberAction = await punish(config.thresholdAction, {
      message, member, config, guildConfig, reason: `heat ${Math.round(heatAfter)} ≥ ${config.heatThreshold}`, cases, logger,
    });
    const phrasing = DM_PHRASING[memberAction];
    if (guildConfig?.dmOnAction && phrasing) {
      await dmTarget(
        member.user ?? member,
        infoEmbed(`You were ${phrasing} in ${message.guild.name}`, "**Reason:** AutoMod — accumulated violations"),
        logger,
      );
    }
  }
  return { memberAction };
}
