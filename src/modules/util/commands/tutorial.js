import { SlashCommandBuilder } from "discord.js";
import { runPager } from "../../../lib/navigator.js";
import { renderChapter, chapterCount } from "../tutorial.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tutorial")
    .setDescription("An interactive walkthrough of how Suzune works."),
  permissions: [],
  async execute(interaction, ctx) {
    await runPager({
      interaction,
      count: chapterCount(),
      render: renderChapter,
      ownerId: interaction.user.id,
      awaitFn: ctx?.awaitFn,
    });
  },
};
