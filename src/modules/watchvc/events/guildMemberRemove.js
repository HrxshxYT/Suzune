import { Events } from "discord.js";

export default {
  name: Events.GuildMemberRemove,
  execute(ctx, member) {
    ctx.watchvc.refreshStatus(member.guild.id);
  },
};
