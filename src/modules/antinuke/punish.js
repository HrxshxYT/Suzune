export async function applyPunishment({
  type,
  guild,
  executorId,
  member,
  reason,
  quarantineRoleId,
  logger,
}) {
  try {
    switch (type) {
      case "ban":
        await guild.bans.create(executorId, { reason });
        return "ban";
      case "kick":
        if (member) await member.kick(reason);
        return "kick";
      case "strip":
        if (member) await member.roles.set([], reason);
        return "strip";
      case "quarantine":
        if (member && quarantineRoleId) await member.roles.set([quarantineRoleId], reason);
        return "quarantine";
      case "removeperms":
        // Removing all roles is the safe proxy for stripping dangerous permissions.
        if (member) await member.roles.set([], reason);
        return "removeperms";
      default:
        return "none";
    }
  } catch (err) {
    logger.error({ err, type, executorId }, "anti-nuke punishment failed");
    return "failed";
  }
}
