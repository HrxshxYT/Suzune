import { brandEmbed } from "../../lib/embeds.js";
import { EMOJIS } from "../../lib/constants.js";

export function buildLeaderboardEmbed(rows, page, pageSize = 10) {
  const start = page * pageSize;
  const body = rows.length
    ? rows.map((e, idx) => `**${start + idx + 1}.** <@${e.userId}> — ${e.count}`).join("\n")
    : "No invites tracked yet.";
  return brandEmbed({ title: `${EMOJIS.star} Invite Leaderboard`, description: body });
}
