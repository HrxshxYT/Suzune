import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from "discord.js";
import { successEmbed } from "../../../lib/embeds.js";
import { buildId, KINDS } from "../constants.js";
import { inTicketControls } from "./open.js";
import { buildTranscript } from "../transcript.js";

export function archivedControls(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(buildId(KINDS.REOPEN, ticketId)).setLabel("Reopen").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(buildId(KINDS.TRANSCRIPT, ticketId)).setLabel("Transcript").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildId(KINDS.DELETE, ticketId)).setLabel("Delete").setStyle(ButtonStyle.Danger),
  );
}

export async function handleClose(interaction, ctx, ticket) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(buildId(KINDS.CLOSE_CONFIRM, ticket.id)).setLabel("Confirm close").setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({ embeds: [successEmbed("Close this ticket?")], components: [row], ephemeral: true });
}

export async function handleCloseConfirm(interaction, ctx, ticket) {
  await interaction.deferUpdate().catch(() => {});
  const channel = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
  await ctx.tickets.setStatus(ticket.id, "archived");
  if (channel) {
    await channel.permissionOverwrites.delete(ticket.openerId).catch(() => {});
    await channel.setName(`closed-${ticket.number}`).catch(() => {});
    const controlMsg = await findControlMessage(channel);
    if (controlMsg) await controlMsg.edit({ components: [archivedControls(ticket.id)] }).catch(() => {});
  }
  await interaction.editReply({ embeds: [successEmbed("Ticket archived.")], components: [] }).catch(() => {});
}

export async function handleReopen(interaction, ctx, ticket) {
  await interaction.deferUpdate().catch(() => {});
  const channel = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
  await ctx.tickets.setStatus(ticket.id, "open");
  if (channel) {
    await channel.permissionOverwrites.edit(ticket.openerId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }).catch(() => {});
    const category = await ctx.tickets.getCategory(ticket.categoryId).catch(() => null);
    const prefix = category?.namePrefix ?? "ticket";
    await channel.setName(`${prefix}-${ticket.number}`).catch(() => {});
    const controlMsg = await findControlMessage(channel);
    if (controlMsg) await controlMsg.edit({ components: [inTicketControls(ticket.id)] }).catch(() => {});
  }
  await interaction.editReply({ components: [inTicketControls(ticket.id)] }).catch(() => {});
}

export async function handleTranscript(interaction, ctx, ticket) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const category = await ctx.tickets.getCategory(ticket.categoryId).catch(() => null);
  const { buffer, filename } = await buildTranscript(interaction.channel, {
    number: ticket.number,
    categoryLabel: category?.label,
    openerTag: ticket.openerId,
  });
  await interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: filename })] });
}

export async function handleDelete(interaction, ctx, ticket) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const config = await ctx.tickets.getConfig(interaction.guildId);
  const category = await ctx.tickets.getCategory(ticket.categoryId).catch(() => null);
  const { buffer, filename } = await buildTranscript(interaction.channel, {
    number: ticket.number,
    categoryLabel: category?.label,
    openerTag: ticket.openerId,
  });
  const file = new AttachmentBuilder(buffer, { name: filename });

  if (config.transcriptChannelId) {
    const tc = await interaction.guild.channels.fetch(config.transcriptChannelId).catch(() => null);
    if (tc) await tc.send({ embeds: [successEmbed(`Transcript — ticket #${ticket.number}`)], files: [file] }).catch(() => {});
  }
  if (config.dmTranscript) {
    const opener = await ctx.client.users.fetch(ticket.openerId).catch(() => null);
    if (opener) await opener.send({ content: `Transcript for your ticket #${ticket.number}`, files: [new AttachmentBuilder(buffer, { name: filename })] }).catch(() => {});
  }

  await ctx.tickets.setStatus(ticket.id, "closed", new Date());
  await interaction.editReply({ embeds: [successEmbed("Deleting…")] }).catch(() => {});
  const channel = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
  if (channel) await channel.delete("Ticket closed").catch(() => {});
}

async function findControlMessage(channel) {
  // The control row lives on the bot's first message in the channel.
  const msgs = await channel.messages.fetch({ after: "0", limit: 5 }).catch(() => null);
  if (!msgs) return null;
  const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return sorted.find((m) => m.author?.bot && m.components?.length) ?? null;
}
