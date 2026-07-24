// Turn hits into heat. Live hits accumulate weighted heat and may mark the
// message for deletion; dry-run hits are recorded but contribute nothing.
export function score({ hits, guildId, userId, heat, halfLifeMs }) {
  const dryRunHits = [];
  const liveHits = [];
  let deleteMessage = false;
  let heatAfter = heat.get(guildId, userId, halfLifeMs);

  for (const hit of hits) {
    if (hit.dryRun) {
      dryRunHits.push(hit);
      continue;
    }
    liveHits.push(hit);
    if (hit.deleteOnHit) deleteMessage = true;
    heatAfter = heat.add(guildId, userId, hit.weight, halfLifeMs);
  }

  return { heatAfter, deleteMessage, dryRunHits, liveHits };
}
