import { EmbedBuilder } from "discord.js";

export async function handleClaim(interaction, ctx, ticket) {
  const caller = interaction.user.id;
  const unclaiming = ticket.claimedById === caller;
  const next = unclaiming ? null : caller;
  await ctx.tickets.setClaim(ticket.id, next);

  const existingEmbed = interaction.message.embeds?.[0];
  if (existingEmbed) {
    const rebuilt = EmbedBuilder.from(existingEmbed);
    const fields = (rebuilt.data.fields ?? []).filter((f) => f.name !== "Claimed by");
    if (next !== null) {
      fields.push({ name: "Claimed by", value: `<@${caller}>`, inline: true });
    }
    rebuilt.setFields(fields);
    await interaction.update({ embeds: [rebuilt], components: interaction.message.components }).catch(() => {});
  } else {
    await interaction.update({ components: interaction.message.components }).catch(() => {});
  }

  await interaction.channel.send(
    unclaiming ? `Ticket released by <@${caller}>.` : `Ticket claimed by <@${caller}>.`,
  ).catch(() => {});
}
