import { SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { buildHelpDetailEmbed, buildCategoryEmbed, categoryNames } from "../help.js";
import { runPager } from "../../../lib/navigator.js";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List commands or get help for a specific command.")
    .addStringOption((o) =>
      o.setName("command").setDescription("A command to get details on").setAutocomplete(true),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const name = interaction.options.getString("command");
    if (!name) {
      const count = categoryNames(ctx.commands).length;
      await runPager({
        interaction,
        count,
        render: (page) => buildCategoryEmbed(ctx.commands, page),
        ownerId: interaction.user.id,
        awaitFn: ctx?.awaitFn,
      });
      return;
    }
    const command = ctx.commands.get(name);
    if (!command) {
      await interaction.reply({
        embeds: [errorEmbed(`No command named \`${name}\`.`)],
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({ embeds: [buildHelpDetailEmbed(command)] });
  },
  async autocomplete(interaction, ctx) {
    const focused = (interaction.options.getFocused() ?? "").toLowerCase();
    const choices = [...ctx.commands.keys()]
      .filter((n) => n.toLowerCase().startsWith(focused))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    await interaction.respond(choices);
  },
};
