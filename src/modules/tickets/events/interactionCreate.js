import { Events } from "discord.js";
import { handleTicketInteraction } from "../router.js";

export default {
  name: Events.InteractionCreate,
  async execute(ctx, interaction) {
    const isComponent = interaction.isMessageComponent?.() || interaction.isModalSubmit?.();
    if (!isComponent) return;
    if (typeof interaction.customId !== "string" || !interaction.customId.startsWith("ticket:")) return;
    await handleTicketInteraction(interaction, ctx);
  },
};
