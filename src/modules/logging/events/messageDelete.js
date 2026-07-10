import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { messageDeleteEmbed } from "../embeds.js";

export default {
  name: Events.MessageDelete,
  async execute(ctx, message) {
    if (!message.guild) return;
    if (message.author?.bot) return;
    await logEvent(ctx, message.guild, "messageDelete", messageDeleteEmbed(message));
  },
};
