import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from "discord.js";
import { COLORS } from "../../../lib/constants.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";
import { buildId, KINDS } from "../constants.js";

export function renderWelcome(template, { openerId }) {
  return String(template ?? "").replaceAll("{mention}", `<@${openerId}>`);
}

export function inTicketControls(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(buildId(KINDS.CLAIM, ticketId)).setLabel("Claim").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildId(KINDS.MEMBERS, ticketId)).setLabel("Members").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildId(KINDS.CLOSE, ticketId)).setLabel("Close").setStyle(ButtonStyle.Danger),
  );
}

export async function handleOpenSelect(interaction, ctx) {
  const [, , panelId] = interaction.customId.split(":");
  const categoryId = interaction.values?.[0];
  const category = categoryId ? await ctx.tickets.getCategory(categoryId) : null;
  if (!category) {
    await interaction.reply({ embeds: [errorEmbed("That category no longer exists.")], ephemeral: true });
    return;
  }
  if (category.reasonPrompt) {
    const modal = new ModalBuilder()
      .setCustomId(buildId(KINDS.OPEN_MODAL, panelId, category.id))
      .setTitle("Open a ticket");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel(category.reasonPrompt.slice(0, 45))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
    await interaction.showModal(modal);
    return;
  }
  await createTicketChannel({ interaction, ctx, panelId, category, reason: null });
}

export async function handleOpenModal(interaction, ctx) {
  const [, , panelId, categoryId] = interaction.customId.split(":");
  const category = await ctx.tickets.getCategory(categoryId);
  if (!category) {
    await interaction.reply({ embeds: [errorEmbed("That category no longer exists.")], ephemeral: true });
    return;
  }
  const reason = interaction.fields.getTextInputValue("reason");
  await createTicketChannel({ interaction, ctx, panelId, category, reason });
}

export async function createTicketChannel({ interaction, ctx, panelId, category, reason }) {
  const guild = interaction.guild;
  const openerId = interaction.user.id;

  const config = await ctx.tickets.getConfig(interaction.guildId);
  if (config.maxOpenPerUser > 0) {
    const open = await ctx.tickets.countOpenForUser(interaction.guildId, openerId, category.id);
    if (open >= config.maxOpenPerUser) {
      await interaction.reply({
        embeds: [errorEmbed(`You already have ${open} open ${category.label} ticket(s).`)],
        ephemeral: true,
      });
      return;
    }
  }

  const me = guild.members.me;
  if (me && (!me.permissions.has(PermissionFlagsBits.ManageChannels) || !me.permissions.has(PermissionFlagsBits.ManageRoles))) {
    await interaction.reply({ embeds: [errorEmbed("I need the **Manage Channels** and **Manage Roles** permissions to open tickets.")], ephemeral: true });
    return;
  }

  const staffRoleIds = Array.isArray(category.staffRoleIds) ? category.staffRoleIds : [];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: openerId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    ...staffRoleIds.map((rid) => ({
      id: rid,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];

  let channel;
  try {
    channel = await guild.channels.create({
      name: `${category.namePrefix}-${await ctx.tickets.peekNextNumber(interaction.guildId)}`,
      type: ChannelType.GuildText,
      parent: category.discordCategoryId ?? undefined,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    ctx.logger?.error({ err }, "ticket channel create failed");
    await interaction.reply({ embeds: [errorEmbed("Could not create the ticket channel (check my permissions and the parent category).")], ephemeral: true });
    return;
  }

  const ticket = await ctx.tickets.createTicket({
    guildId: interaction.guildId,
    panelId,
    categoryId: category.id,
    openerId,
    channelId: channel.id,
    reason: reason ?? null,
  });

  // Channel was named with a peeked number; rename to the authoritative one if they differ.
  if (channel.name !== `${category.namePrefix}-${ticket.number}`) {
    await channel.setName(`${category.namePrefix}-${ticket.number}`).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(`🎫 Ticket #${ticket.number} — ${category.label}`)
    .setDescription(renderWelcome(category.welcomeMessage, { openerId }) + (reason ? `\n\n**Reason:** ${reason}` : ""));

  await channel.send({ content: `<@${openerId}>`, embeds: [embed], components: [inTicketControls(ticket.id)] });
  await interaction.reply({ embeds: [successEmbed(`Opened <#${channel.id}>.`)], ephemeral: true });
}
