import { ActionRowBuilder, UserSelectMenuBuilder } from "discord.js";
import { buildId, KINDS } from "../constants.js";

export async function handleMembers(interaction, ctx, ticket) {
  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(buildId(KINDS.MEMBER_PICK, ticket.id))
      .setPlaceholder("Add or remove a member…")
      .setMinValues(1)
      .setMaxValues(1),
  );
  await interaction.reply({ content: "Pick a member to toggle:", components: [row], ephemeral: true });
}

export async function handleMemberPick(interaction, ctx, ticket) {
  const userId = interaction.values[0];
  // Ack before the channel fetch/overwrite so slow calls can't expire the interaction.
  await interaction.deferUpdate().catch(() => {});
  const channel = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel) {
    await interaction.editReply({ content: "This ticket channel no longer exists.", components: [] }).catch(() => {});
    return;
  }
  const existing = channel.permissionOverwrites.cache.get(userId);
  if (existing) {
    await channel.permissionOverwrites.delete(userId);
    await interaction.editReply({ content: `Removed <@${userId}> from the ticket.`, components: [] }).catch(() => {});
  } else {
    await channel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    await interaction.editReply({ content: `Added <@${userId}> to the ticket.`, components: [] }).catch(() => {});
  }
}
