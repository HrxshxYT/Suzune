import { Events, AuditLogEvent } from "discord.js";
import { postAudit } from "../dispatch.js";
import { fetchActor } from "../attribution.js";
import {
  auditEmbed,
  memberJoin,
  memberLeave,
  messageDelete,
  messageEdit,
  memberDiff,
} from "../format.js";

// Wrap a builder that returns { guild, embed } (or null) into a discovered listener.
function L(name, category, build) {
  return {
    name,
    async execute(ctx, ...args) {
      try {
        const res = await build(ctx, ...args);
        if (res?.guild && res.embed) await postAudit(ctx, res.guild, category, res.embed);
      } catch (err) {
        ctx.logger?.error?.({ err }, `audit ${name} failed`);
      }
    },
  };
}

// Append an "Actor" line to an embed if we can attribute the action via the audit log.
async function withActor(guild, auditType, targetId, embed) {
  const actor = await fetchActor(guild, auditType, targetId);
  if (actor) {
    const extra = `\n**By:** <@${actor.id}>${actor.reason ? ` — ${actor.reason}` : ""}`;
    embed.setDescription((embed.data.description ?? "") + extra);
  }
  return embed;
}

const listeners = [
  L(Events.GuildMemberAdd, "members", (_c, m) => ({ guild: m.guild, embed: memberJoin(m) })),
  L(Events.GuildMemberRemove, "members", (_c, m) => ({ guild: m.guild, embed: memberLeave(m) })),

  L(Events.GuildBanAdd, "bans", async (_c, ban) => ({
    guild: ban.guild,
    embed: await withActor(
      ban.guild,
      AuditLogEvent.MemberBanAdd,
      ban.user?.id,
      auditEmbed({
        title: "🔨 Member Banned",
        description: `<@${ban.user?.id}> (${ban.user?.tag ?? ban.user?.id})`,
      }),
    ),
  })),
  L(Events.GuildBanRemove, "bans", async (_c, ban) => ({
    guild: ban.guild,
    embed: await withActor(
      ban.guild,
      AuditLogEvent.MemberBanRemove,
      ban.user?.id,
      auditEmbed({ title: "♻️ Member Unbanned", description: `<@${ban.user?.id}>` }),
    ),
  })),

  L(Events.GuildMemberUpdate, "memberEdits", (_c, oldM, newM) => {
    const embed = memberDiff(oldM, newM);
    return embed ? { guild: newM.guild, embed } : null;
  }),

  L(Events.MessageUpdate, "messages", (_c, oldM, newM) => {
    if (!newM.guild || newM.author?.bot) return null;
    if (oldM.content === newM.content) return null;
    return { guild: newM.guild, embed: messageEdit(oldM, newM) };
  }),
  L(Events.MessageDelete, "messages", (_c, m) => {
    if (!m.guild || m.author?.bot) return null;
    return { guild: m.guild, embed: messageDelete(m) };
  }),
  L(Events.MessageBulkDelete, "messages", (_c, messages, channel) => {
    const guild = channel?.guild;
    if (!guild) return null;
    return {
      guild,
      embed: auditEmbed({
        title: "🗑️ Bulk Message Delete",
        description: `**${messages.size}** messages deleted in <#${channel.id}>`,
      }),
    };
  }),

  L(Events.ChannelCreate, "channels", async (_c, ch) => ({
    guild: ch.guild,
    embed: await withActor(
      ch.guild,
      AuditLogEvent.ChannelCreate,
      ch.id,
      auditEmbed({ title: "➕ Channel Created", description: `<#${ch.id}> (\`${ch.name}\`)` }),
    ),
  })),
  L(Events.ChannelDelete, "channels", async (_c, ch) => {
    if (!ch.guild) return null;
    return {
      guild: ch.guild,
      embed: await withActor(
        ch.guild,
        AuditLogEvent.ChannelDelete,
        ch.id,
        auditEmbed({ title: "➖ Channel Deleted", description: `\`${ch.name}\`` }),
      ),
    };
  }),
  L(Events.ChannelUpdate, "channels", (_c, oldC, newC) => {
    if (!newC.guild) return null;
    if (oldC.name === newC.name && oldC.topic === newC.topic) return null;
    const changes = [];
    if (oldC.name !== newC.name) changes.push(`**Name:** \`${oldC.name}\` → \`${newC.name}\``);
    if (oldC.topic !== newC.topic) changes.push("**Topic** changed");
    return {
      guild: newC.guild,
      embed: auditEmbed({ title: "✏️ Channel Updated", description: `<#${newC.id}>\n${changes.join("\n")}` }),
    };
  }),

  L(Events.GuildRoleCreate, "roles", async (_c, role) => ({
    guild: role.guild,
    embed: await withActor(
      role.guild,
      AuditLogEvent.RoleCreate,
      role.id,
      auditEmbed({ title: "➕ Role Created", description: `<@&${role.id}> (\`${role.name}\`)` }),
    ),
  })),
  L(Events.GuildRoleDelete, "roles", async (_c, role) => ({
    guild: role.guild,
    embed: await withActor(
      role.guild,
      AuditLogEvent.RoleDelete,
      role.id,
      auditEmbed({ title: "➖ Role Deleted", description: `\`${role.name}\`` }),
    ),
  })),
  L(Events.GuildRoleUpdate, "roles", (_c, oldR, newR) => {
    const changes = [];
    if (oldR.name !== newR.name) changes.push(`**Name:** \`${oldR.name}\` → \`${newR.name}\``);
    if (oldR.hexColor !== newR.hexColor) changes.push(`**Color:** ${oldR.hexColor} → ${newR.hexColor}`);
    if (oldR.permissions?.bitfield !== newR.permissions?.bitfield) changes.push("**Permissions** changed");
    if (!changes.length) return null;
    return {
      guild: newR.guild,
      embed: auditEmbed({ title: "✏️ Role Updated", description: `<@&${newR.id}>\n${changes.join("\n")}` }),
    };
  }),

  L(Events.GuildUpdate, "server", (_c, oldG, newG) => {
    const changes = [];
    if (oldG.name !== newG.name) changes.push(`**Name:** ${oldG.name} → ${newG.name}`);
    if (oldG.icon !== newG.icon) changes.push("**Icon** changed");
    if (!changes.length) return null;
    return { guild: newG, embed: auditEmbed({ title: "🏠 Server Updated", description: changes.join("\n") }) };
  }),

  L(Events.GuildEmojiCreate, "emojis", (_c, e) => ({
    guild: e.guild,
    embed: auditEmbed({ title: "😀 Emoji Added", description: `\`:${e.name}:\`` }),
  })),
  L(Events.GuildEmojiDelete, "emojis", (_c, e) => ({
    guild: e.guild,
    embed: auditEmbed({ title: "😶 Emoji Removed", description: `\`:${e.name}:\`` }),
  })),
  L(Events.GuildStickerCreate, "emojis", (_c, s) => ({
    guild: s.guild,
    embed: auditEmbed({ title: "🏷️ Sticker Added", description: `\`${s.name}\`` }),
  })),
  L(Events.GuildStickerDelete, "emojis", (_c, s) => ({
    guild: s.guild,
    embed: auditEmbed({ title: "🏷️ Sticker Removed", description: `\`${s.name}\`` }),
  })),

  L(Events.ThreadCreate, "threads", (_c, t) => ({
    guild: t.guild,
    embed: auditEmbed({ title: "🧵 Thread Created", description: `<#${t.id}> (\`${t.name}\`)` }),
  })),
  L(Events.ThreadDelete, "threads", (_c, t) => ({
    guild: t.guild,
    embed: auditEmbed({ title: "🧵 Thread Deleted", description: `\`${t.name}\`` }),
  })),

  L(Events.VoiceStateUpdate, "voice", (_c, oldS, newS) => {
    const guild = newS.guild ?? oldS.guild;
    if (!guild) return null;
    const uid = newS.id ?? oldS.id;
    let text = null;
    if (!oldS.channelId && newS.channelId) text = `<@${uid}> joined <#${newS.channelId}>`;
    else if (oldS.channelId && !newS.channelId) text = `<@${uid}> left <#${oldS.channelId}>`;
    else if (oldS.channelId !== newS.channelId)
      text = `<@${uid}> moved <#${oldS.channelId}> → <#${newS.channelId}>`;
    if (!text) return null;
    return { guild, embed: auditEmbed({ title: "🔊 Voice", description: text }) };
  }),

  L(Events.InviteCreate, "invites", (_c, inv) => ({
    guild: inv.guild,
    embed: auditEmbed({
      title: "📨 Invite Created",
      description: `\`${inv.code}\`${inv.inviterId ? ` by <@${inv.inviterId}>` : ""}`,
    }),
  })),
  L(Events.InviteDelete, "invites", (_c, inv) => ({
    guild: inv.guild,
    embed: auditEmbed({ title: "📪 Invite Deleted", description: `\`${inv.code}\`` }),
  })),
];

export default listeners;
