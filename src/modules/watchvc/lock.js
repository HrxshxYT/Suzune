import { PermissionFlagsBits } from "discord.js";

// Permission-overwrite payloads for a "locked but visible" voice channel.
// String flag names are accepted by channel.permissionOverwrites.set(). @everyone
// can see the channel but cannot connect; the bot keeps view + connect.
export function lockOverwrites(everyoneRoleId, botId) {
  return [
    { id: everyoneRoleId, allow: ["ViewChannel"], deny: ["Connect"] },
    { id: botId, allow: ["ViewChannel", "Connect"], deny: [] },
  ];
}

// Given the bot's resolved permissions for the target channel (a PermissionsBitField
// or anything with .has(flag)), return human labels for any lock prerequisite it lacks.
export function missingLockPermissions(perms) {
  const required = [
    [PermissionFlagsBits.ManageChannels, "Manage Channels"],
    [PermissionFlagsBits.Connect, "Connect"],
    [PermissionFlagsBits.ViewChannel, "View Channel"],
  ];
  return required.filter(([flag]) => !perms.has(flag)).map(([, label]) => label);
}
