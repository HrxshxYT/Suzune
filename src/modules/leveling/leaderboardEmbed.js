import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { levelForXp } from "./curve.js";

export function buildLevelLeaderboardEmbed(entries, page, pageSize) {
  const embed = new EmbedBuilder().setColor(COLORS.brand).setTitle("🏆 XP Leaderboard");

  if (!entries.length) {
    return embed.setDescription("No one has earned XP yet.");
  }

  const lines = entries.map((e, i) => {
    const rank = page * pageSize + i + 1;
    return `**#${rank}** <@${e.userId}> — level ${levelForXp(e.xp)} · ${e.xp} XP`;
  });
  return embed.setDescription(lines.join("\n"));
}
