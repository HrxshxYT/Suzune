import { ChannelType, GuildVerificationLevel, PermissionsBitField } from "discord.js";
import { snapshotChannelField, snapshotRolePerm, readOverwrite } from "./snapshot.js";
import { runBatched } from "./batch.js";

const TEXT_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
]);
const VOICE_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

export function textChannelIds(guild) {
  return [...guild.channels.cache.values()].filter((c) => TEXT_TYPES.has(c.type)).map((c) => c.id);
}

export function voiceChannelIds(guild) {
  return [...guild.channels.cache.values()].filter((c) => VOICE_TYPES.has(c.type)).map((c) => c.id);
}

// panic: one API call, strip SendMessages from the @everyone role guild-wide.
export async function applyPanic(guild, { reason }) {
  const everyone = guild.roles.everyone;
  const snapshot = snapshotRolePerm(everyone, "SendMessages");
  const next = everyone.permissions.remove(PermissionsBitField.Flags.SendMessages);
  await everyone.setPermissions(next, reason);
  return { snapshots: [snapshot] };
}

// Shared overwrite-deny logic for channels/voice tiers.
async function applyOverwriteDeny(guild, { channelIds, modRoleIds, fields, reason, onProgress }) {
  const snapshots = [];
  const worker = async (channelId) => {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) throw new Error(`channel ${channelId} not found`);

    for (const field of fields) {
      snapshots.push(snapshotChannelField(channel, guild.roles.everyone.id, field));
    }
    await channel.permissionOverwrites.edit(
      guild.roles.everyone.id,
      Object.fromEntries(fields.map((f) => [f, false])),
      { reason },
    );

    // staff bypass: ensure mod roles keep an explicit allow so staff can coordinate
    for (const roleId of modRoleIds) {
      const rows = fields.map((field) => {
        const snap = snapshotChannelField(channel, roleId, field);
        const prior = readOverwrite(channel, roleId, field);
        snap.addedByUs = !prior.priorAllow; // we granted an allow it didn't already have
        return snap;
      });
      snapshots.push(...rows);
      await channel.permissionOverwrites.edit(
        roleId,
        Object.fromEntries(fields.map((f) => [f, true])),
        { reason },
      );
    }
  };

  const { failed } = await runBatched(channelIds, worker, { concurrency: 6, onProgress });
  return { snapshots, failed };
}

export function applyChannels(guild, { channelIds, modRoleIds, reason, onProgress }) {
  return applyOverwriteDeny(guild, {
    channelIds,
    modRoleIds,
    fields: ["SendMessages"],
    reason,
    onProgress,
  });
}

export function applyVoice(guild, { channelIds, modRoleIds, reason, onProgress }) {
  return applyOverwriteDeny(guild, {
    channelIds,
    modRoleIds,
    fields: ["Connect", "Speak"],
    reason,
    onProgress,
  });
}

// invites: flag only. Never delete invite links. disableInvites() has no
// reason parameter in discord.js v14 (it goes through guild.edit internally).
export async function applyInvites(guild, { reason: _reason }) {
  if (guild.features.includes("INVITES_DISABLED")) return { invitesPausedByUs: false };
  await guild.disableInvites(true);
  return { invitesPausedByUs: true };
}

// joins: raise verification to max, record prior.
export async function applyJoins(guild, { reason }) {
  const priorVerificationLevel = guild.verificationLevel;
  await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, reason);
  return { priorVerificationLevel };
}
