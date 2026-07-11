import { Events } from "discord.js";
import { isWhitelisted } from "./config.js";
import { sendAlert } from "./alert.js";

export async function processMemberAdd({ member, guildConfig, state, deps, logger }) {
  const antinuke = guildConfig.antinuke;
  if (!antinuke?.enabled || !antinuke.antiRaidEnabled) return { action: "disabled" };

  if (isWhitelisted(member, guildConfig.whitelist)) return { action: "exempt_whitelist" };

  const count = state.recordJoin(member.guild.id, antinuke.raidWindowSec * 1000);
  if (count < antinuke.raidJoinCount) return { action: "under_threshold", count };

  await deps.kickMember(member, "Anti-raid: join spike detected!");
  await deps.sendAlert(
    {
      guild: member.guild,
      channelId: antinuke.alertChannelId,
      actionKey: "antiRaid",
      executorId: member.id,
      count,
      punishment: "kick",
    },
    logger,
  );
  return { action: "raid", count };
}

export default {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    try {
      const guildConfig = await ctx.config.getGuild(member.guild.id);
      const deps = {
        kickMember: (m, reason) => m.kick(reason).catch(() => {}),
        sendAlert,
      };
      const result = await processMemberAdd({
        member,
        guildConfig,
        state: ctx.antinuke,
        deps,
        logger: ctx.logger,
      });
      if (result?.action === "raid" && ctx.stats) {
        await ctx.stats
          .incrementAntinukeTriggers()
          .catch((err) => ctx.logger.error({ err }, "anti-raid stat increment failed"));
      }
    } catch (err) {
      ctx.logger.error({ err }, "anti-raid listener error");
    }
  },
};
