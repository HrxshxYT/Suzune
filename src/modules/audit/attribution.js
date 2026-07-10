/**
 * Best-effort "who did it" lookup via the guild audit log. Returns null if we can't
 * attribute (missing permission, no recent matching entry, or any error).
 */
export async function fetchActor(guild, auditType, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 5 });
    const entry = logs.entries.find(
      (e) =>
        (!targetId || e.target?.id === targetId) &&
        Date.now() - e.createdTimestamp < 8000,
    );
    if (!entry?.executor) return null;
    return { tag: entry.executor.tag, id: entry.executor.id, reason: entry.reason ?? null };
  } catch {
    return null;
  }
}
