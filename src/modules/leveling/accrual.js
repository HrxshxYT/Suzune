import { shouldAward, randomXp, detectLevelUp } from "./award.js";
import { resolveRewards } from "./rewards.js";

// Orchestrates one message's XP award. All side-effects (DB, announce, roles) are
// injected/guarded so this never throws out of the listener.
export async function processMessageXp({ message, config, service, cooldowns, rng = Math.random, logger }) {
  const memberRoleIds = [...(message.member?.roles?.cache?.keys?.() ?? [])];
  if (!shouldAward({
    authorBot: message.author?.bot ?? false,
    inGuild: Boolean(message.guild),
    config,
    memberRoleIds,
    channelId: message.channelId,
  })) return;

  const cd = cooldowns.check(`xp:${message.guildId}`, message.author.id, config.cooldownSec);
  if (cd.limited) return;

  const amount = randomXp(config.xpMin, config.xpMax, rng);
  let oldXp, newXp;
  try {
    ({ oldXp, newXp } = await service.addXp(message.guildId, message.author.id, amount));
  } catch (err) {
    logger?.error({ err }, "xp award failed");
    return;
  }
  const { leveledUp, newLevel } = detectLevelUp(oldXp, newXp);
  if (!leveledUp) return;

  if (config.announce) {
    try {
      await message.channel.send(
        `🎉 <@${message.author.id}> reached **level ${newLevel}**!`,
      );
    } catch (err) {
      logger?.error({ err }, "level-up announce failed");
    }
  }

  await applyRewards({ message, service, newLevel, logger });
}

async function applyRewards({ message, service, newLevel, logger }) {
  const member = message.member;
  if (!member) return;
  let rewards;
  try {
    rewards = await service.getRewards(message.guildId);
  } catch (err) {
    logger?.error({ err }, "level reward lookup failed");
    return;
  }
  if (!rewards.length) return;

  const currentRoleIds = [...member.roles.cache.keys()];
  const { add, remove } = resolveRewards({ level: newLevel, rewards, currentRoleIds });
  for (const roleId of add) {
    try { await member.roles.add(roleId); } catch (err) { logger?.error({ err, roleId }, "reward add failed"); }
  }
  for (const roleId of remove) {
    try { await member.roles.remove(roleId); } catch (err) { logger?.error({ err, roleId }, "reward remove failed"); }
  }
}
