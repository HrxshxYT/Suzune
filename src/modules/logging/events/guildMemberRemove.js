import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { memberLeaveEmbed } from "../embeds.js";

export default {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    if (!member.guild) return;
    await logEvent(ctx, member.guild, "memberJoinLeave", memberLeaveEmbed(member));
  },
};
