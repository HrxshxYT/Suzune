import { PermissionFlagsBits } from "discord.js";
import { errorEmbed } from "../../lib/embeds.js";
import { parseId, KINDS } from "./constants.js";
import { handleOpenSelect, handleOpenModal } from "./lifecycle/open.js";
import { handleClaim } from "./lifecycle/claim.js";
import { handleMembers, handleMemberPick } from "./lifecycle/members.js";
import {
  handleClose, handleCloseConfirm, handleReopen, handleTranscript, handleDelete,
} from "./lifecycle/close.js";

const STAFF_ONLY = new Set([
  KINDS.CLAIM, KINDS.MEMBERS, KINDS.MEMBER_PICK,
  KINDS.CLOSE, KINDS.CLOSE_CONFIRM, KINDS.REOPEN, KINDS.TRANSCRIPT, KINDS.DELETE,
]);

// Kinds that operate on an existing ticket (need a ticket + category load).
const TICKET_SCOPED = new Set([
  KINDS.CLAIM, KINDS.MEMBERS, KINDS.MEMBER_PICK,
  KINDS.CLOSE, KINDS.CLOSE_CONFIRM, KINDS.REOPEN, KINDS.TRANSCRIPT, KINDS.DELETE,
]);

export function isStaff(member, category) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
      member.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    return true;
  }
  const staffRoleIds = Array.isArray(category?.staffRoleIds) ? category.staffRoleIds : [];
  return Boolean(staffRoleIds.length && member.roles?.cache?.hasAny?.(...staffRoleIds));
}

export async function handleTicketInteraction(interaction, ctx) {
  const parsed = parseId(interaction.customId);
  if (!parsed) return;
  const { kind, args } = parsed;

  try {
    // Panel-level kinds (open the flow, no existing ticket yet).
    if (kind === KINDS.OPEN) return await handleOpenSelect(interaction, ctx);
    if (kind === KINDS.OPEN_MODAL) return await handleOpenModal(interaction, ctx);

    if (!TICKET_SCOPED.has(kind)) {
      await interaction.reply({ embeds: [errorEmbed("This ticket control is no longer valid.")], ephemeral: true });
      return;
    }

    const ticketId = args[0];
    const ticket = await ctx.tickets.getTicket(ticketId);
    if (!ticket) {
      await interaction.reply({ embeds: [errorEmbed("This ticket no longer exists.")], ephemeral: true });
      return;
    }

    if (STAFF_ONLY.has(kind)) {
      const category = ticket.categoryId ? await ctx.tickets.getCategory(ticket.categoryId).catch(() => null) : null;
      if (!isStaff(interaction.member, category)) {
        await interaction.reply({ embeds: [errorEmbed("Only staff can use this.")], ephemeral: true });
        return;
      }
    }

    switch (kind) {
      case KINDS.CLAIM: return await handleClaim(interaction, ctx, ticket);
      case KINDS.MEMBERS: return await handleMembers(interaction, ctx, ticket);
      case KINDS.MEMBER_PICK: return await handleMemberPick(interaction, ctx, ticket);
      case KINDS.CLOSE: return await handleClose(interaction, ctx, ticket);
      case KINDS.CLOSE_CONFIRM: return await handleCloseConfirm(interaction, ctx, ticket);
      case KINDS.REOPEN: return await handleReopen(interaction, ctx, ticket);
      case KINDS.TRANSCRIPT: return await handleTranscript(interaction, ctx, ticket);
      case KINDS.DELETE: return await handleDelete(interaction, ctx, ticket);
      default: return;
    }
  } catch (err) {
    ctx.logger?.error({ err, kind }, "ticket interaction failed");
    const embeds = [errorEmbed("Something went wrong handling that.")];
    // Handlers defer up front, so on a later throw the interaction is usually
    // already acked — follow up with a fresh ephemeral rather than trying to
    // (double-)reply, which would itself throw.
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ embeds, ephemeral: true }).catch(() => {});
    }
  }
}
