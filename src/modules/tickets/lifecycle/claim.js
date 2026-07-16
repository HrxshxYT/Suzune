import { EmbedBuilder } from "discord.js";

export async function handleClaim(interaction, ctx, ticket) {
  const caller = interaction.user.id;
  const unclaiming = ticket.claimedById === caller;
  const next = unclaiming ? null : caller;

  // Ack before the DB write so a slow round-trip can't expire the interaction.
  await interaction.deferUpdate().catch(() => {});
  await ctx.tickets.setClaim(ticket.id, next);

  const payload = { components: interaction.message.components };
  const existingEmbed = interaction.message.embeds?.[0];
  if (existingEmbed) {
    const rebuilt = EmbedBuilder.from(existingEmbed);
    const fields = (rebuilt.data.fields ?? []).filter((f) => f.name !== "Claimed by");
    if (next !== null) {
      fields.push({ name: "Claimed by", value: `<@${caller}>`, inline: true });
    }
    rebuilt.setFields(fields);
    payload.embeds = [rebuilt];
  }
  await interaction.editReply(payload).catch(() => {});

  await interaction.channel.send(
    unclaiming ? `Ticket released by <@${caller}>.` : `Ticket claimed by <@${caller}>.`,
  ).catch(() => {});
}
