import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk-delete recent messages in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o.setName("amount").setDescription("How many (1-100)").setRequired(true),
    )
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user")),
  permissions: [PermissionFlagsBits.ManageMessages],
  async execute(interaction, ctx) {
    const amount = interaction.options.getInteger("amount");
    const user = interaction.options.getUser("user");
    if (amount < 1 || amount > 100) {
      await interaction.reply({
        embeds: [errorEmbed("Amount must be between 1 and 100.")],
        ephemeral: true,
      });
      return;
    }
    try {
      let deleted;
      if (user) {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const mine = [...messages.values()]
          .filter((m) => m.author?.id === user.id)
          .slice(0, amount);
        const result = await interaction.channel.bulkDelete(mine, true);
        deleted = result.size ?? mine.length;
      } else {
        const result = await interaction.channel.bulkDelete(amount, true);
        deleted = result.size ?? amount;
      }
      await interaction.reply({
        embeds: [successEmbed(`Deleted **${deleted}** message(s).`)],
        ephemeral: true,
      });
    } catch (err) {
      ctx.logger.error({ err }, "purge failed");
      await interaction.reply({
        embeds: [errorEmbed("I couldn't delete messages (they may be older than 14 days).")],
        ephemeral: true,
      });
    }
  },
};
