export function canUseCommand({ member, command, modRoleIds = [] }) {
  const required = command.permissions ?? [];
  if (required.length === 0) return { ok: true };

  const hasPerm = required.some((flag) => member.permissions.has(flag));
  if (hasPerm) return { ok: true };

  const hasModRole = modRoleIds.some((id) => member.roles.cache.has(id));
  if (hasModRole) return { ok: true };

  return { ok: false, reason: "missing_permission" };
}
