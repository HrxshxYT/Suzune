import { Events } from "discord.js";
import { evaluateMessage, isExempt } from "../evaluate.js";
import { applyAutomodAction } from "../action.js";

export default {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || message.author?.bot) return;

    const guildConfig = await ctx.config.getGuild(message.guild.id);
    const config = guildConfig.automod;
    if (!config?.enabled) return;

    const member = message.member;
    if (isExempt({ member, channelId: message.channelId, config })) return;

    const spamCount = ctx.automod.recordMessage(
      message.guild.id,
      message.author.id,
      config.spamWindowSec * 1000,
    );
    const result = evaluateMessage({ message, config, spamCount });
    if (!result.tripped) return;

    await applyAutomodAction({
      message,
      member,
      config,
      reason: result.reason,
      cases: ctx.cases,
      logger: ctx.logger,
      dmOnAction: guildConfig.dmOnAction,
    });
  },
};
