import { Events } from "discord.js";
import { processMessageXp } from "../accrual.js";

export default {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || message.author?.bot) return;
    try {
      const guildConfig = await ctx.config.getGuild(message.guild.id);
      const config = guildConfig.leveling;
      if (!config?.enabled) return;

      await processMessageXp({
        message,
        config,
        service: ctx.leveling,
        cooldowns: ctx.cooldowns,
        logger: ctx.logger,
      });
    } catch (err) {
      ctx.logger.error({ err }, "leveling messageCreate failed");
    }
  },
};
