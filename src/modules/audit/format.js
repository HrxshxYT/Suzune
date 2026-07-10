import { brandEmbed } from "../../lib/embeds.js";

const MAX = 1000;
function clip(text) {
  const s = String(text ?? "");
  return s.length > MAX ? s.slice(0, MAX - 1) + "…" : s;
}

export function auditEmbed({ title, description, fields, thumbnail }) {
  return brandEmbed({ title, description, fields, thumbnail });
}

export function memberJoin(member) {
  return auditEmbed({
    title: "📥 Member Joined",
    description: `<@${member.id}> (${member.user?.tag ?? member.id})`,
    thumbnail: member.user?.displayAvatarURL?.() ?? null,
  });
}

export function memberLeave(member) {
  return auditEmbed({
    title: "📤 Member Left",
    description: `<@${member.id}> (${member.user?.tag ?? member.id})`,
    thumbnail: member.user?.displayAvatarURL?.() ?? null,
  });
}

export function messageDelete(message) {
  return auditEmbed({
    title: "🗑️ Message Deleted",
    description:
      `**Author:** <@${message.author?.id ?? "?"}>\n` +
      `**Channel:** <#${message.channelId ?? message.channel?.id}>\n` +
      `**Content:** ${message.content ? clip(message.content) : "*(none / not cached)*"}`,
  });
}

export function messageEdit(oldMessage, newMessage) {
  return auditEmbed({
    title: "✏️ Message Edited",
    description:
      `**Author:** <@${newMessage.author?.id ?? "?"}>\n` +
      `**Channel:** <#${newMessage.channelId ?? newMessage.channel?.id}>`,
    fields: [
      { name: "Before", value: clip(oldMessage.content) || "*(not cached)*" },
      { name: "After", value: clip(newMessage.content) || "*(empty)*" },
    ],
  });
}

/**
 * Diff two member states. Returns an embed for nickname/role/timeout changes,
 * or null when nothing audit-relevant changed.
 */
export function memberDiff(oldMember, newMember) {
  const changes = [];

  if ((oldMember.nickname ?? null) !== (newMember.nickname ?? null)) {
    changes.push(
      `**Nickname:** ${oldMember.nickname ?? "*none*"} → ${newMember.nickname ?? "*none*"}`,
    );
  }

  const oldRoles = new Set(oldMember.roles?.cache?.keys?.() ?? []);
  const newRoles = new Set(newMember.roles?.cache?.keys?.() ?? []);
  const added = [...newRoles].filter((r) => !oldRoles.has(r));
  const removed = [...oldRoles].filter((r) => !newRoles.has(r));
  if (added.length) changes.push(`**Roles +** ${added.map((r) => `<@&${r}>`).join(" ")}`);
  if (removed.length) changes.push(`**Roles −** ${removed.map((r) => `<@&${r}>`).join(" ")}`);

  const oldTo = oldMember.communicationDisabledUntilTimestamp ?? null;
  const newTo = newMember.communicationDisabledUntilTimestamp ?? null;
  if (oldTo !== newTo) {
    changes.push(newTo ? "**Timed out** ⏳" : "**Timeout removed** ✅");
  }

  if (!changes.length) return null;
  return auditEmbed({
    title: "👤 Member Updated",
    description: `<@${newMember.id}>\n${changes.join("\n")}`,
    thumbnail: newMember.user?.displayAvatarURL?.() ?? null,
  });
}
