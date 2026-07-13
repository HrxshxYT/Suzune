import { Events } from "discord.js";

export default {
  name: Events.GuildMemberAdd,
  execute(ctx, member) {
    ctx.watchvc.refreshStatus(member.guild.id);
  },
};
