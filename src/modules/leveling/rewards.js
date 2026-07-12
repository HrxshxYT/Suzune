// Highest-only: grant the reward for the highest level <= `level`, and remove any
// other reward roles the member currently holds.
export function resolveRewards({ level, rewards, currentRoleIds = [] }) {
  const earned = rewards
    .filter((r) => r.level <= level)
    .sort((a, b) => b.level - a.level);
  const target = earned[0]?.roleId ?? null;

  const rewardRoleIds = new Set(rewards.map((r) => r.roleId));
  const remove = currentRoleIds.filter((id) => rewardRoleIds.has(id) && id !== target);
  const add = target && !currentRoleIds.includes(target) ? [target] : [];
  return { add, remove };
}
