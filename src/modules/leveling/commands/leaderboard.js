import { SlashCommandBuilder } from "discord.js";
import { paginate } from "../../../lib/components.js";
import { runPager } from "../../../lib/navigator.js";
import { buildLevelLeaderboardEmbed } from "../leaderboardEmbed.js";

const PAGE_SIZE = 10;

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the server XP leaderboard."),
  permissions: [],
  async execute(interaction, ctx) {
    const board = await ctx.leveling.leaderboard(interaction.guildId, 100);
    const pages = paginate(board, PAGE_SIZE);
    await runPager({
      interaction,
      count: Math.max(1, pages.length),
      render: (page) => buildLevelLeaderboardEmbed(pages[page] ?? [], page, PAGE_SIZE),
      ownerId: interaction.user.id,
      awaitFn: ctx?.awaitFn,
    });
  },
};
