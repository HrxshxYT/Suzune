import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { messageEditEmbed } from "../embeds.js";

export default {
  name: Events.MessageUpdate,
  async execute(ctx, oldMessage, newMessage) {
    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // ignore embed/attachment-only updates
    await logEvent(ctx, newMessage.guild, "messageEdit", messageEditEmbed(oldMessage, newMessage));
  },
};
