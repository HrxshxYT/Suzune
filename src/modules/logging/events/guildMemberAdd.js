import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { memberJoinEmbed } from "../embeds.js";

export default {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    await logEvent(ctx, member.guild, "memberJoinLeave", memberJoinEmbed(member));
  },
};
