import { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { BOT_NAME, COLORS } from "../../../lib/constants.js";
import {
  buildHelpDetailEmbed,
  categoryCounts,
  commandsInCategory,
} from "../help.js";
import { buildHomeCard, buildCategoryCard } from "../helpCard.js";
import { categorySelectRow, commandSelectRow } from "../../../lib/components.js";
import { awaitComponent, disableAll } from "../../../lib/collect.js";

const FILE = "help.png";
const FOOTER = "Developed by hrxshxforpresident";

function cardEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(title)
    .setDescription(description)
    .setImage(`attachment://${FILE}`)
    .setFooter({ text: FOOTER });
}

function homePayload(commands, ownerId) {
  const categories = categoryCounts(commands);
  const file = new AttachmentBuilder(buildHomeCard({ botName: BOT_NAME, categories }), { name: FILE });
  return {
    embeds: [cardEmbed(`📖 ${BOT_NAME} — Help`, "Pick a category from the menu to explore its commands.")],
    files: [file],
    attachments: [],
    components: [categorySelectRow({ categories, ownerId })],
  };
}

function categoryPayload(commands, ownerId, category) {
  const categories = categoryCounts(commands);
  const cmds = commandsInCategory(commands, category);
  const file = new AttachmentBuilder(buildCategoryCard({ botName: BOT_NAME, category, commands: cmds }), {
    name: FILE,
  });
  const rows = [categorySelectRow({ categories, selected: category, ownerId })];
  if (cmds.length) rows.push(commandSelectRow({ commands: cmds, ownerId }));
  return {
    embeds: [cardEmbed(`📖 ${category}`, "Pick a command from the menu below for its details.")],
    files: [file],
    attachments: [],
    components: rows,
  };
}

function commandPayload(commands, ownerId, category, commandName) {
  const categories = categoryCounts(commands);
  const cmds = commandsInCategory(commands, category);
  const embed = buildHelpDetailEmbed(commands.get(commandName)).setFooter({ text: FOOTER });
  return {
    embeds: [embed],
    files: [],
    attachments: [],
    components: [
      categorySelectRow({ categories, selected: category, ownerId }),
      commandSelectRow({ commands: cmds, selected: commandName, ownerId }),
    ],
  };
}

// Interactive help: a home overview, a category dropdown to drill in, and a command
// dropdown for per-command details — all in one owner-gated, in-place-updated message.
async function runHelpBrowser({ interaction, commands, awaitFn = awaitComponent, timeMs = 150000 }) {
  const ownerId = interaction.user.id;
  let state = { level: "home", category: null, command: null };
  const build = () => {
    if (state.level === "command") return commandPayload(commands, ownerId, state.category, state.command);
    if (state.level === "category") return categoryPayload(commands, ownerId, state.category);
    return homePayload(commands, ownerId);
  };

  let current = build();
  await interaction.reply(current);
  const message = await interaction.fetchReply();

  for (;;) {
    const i = await awaitFn({ message, ownerId, timeMs });
    if (!i) break;
    if (i.customId === `help:cat:${ownerId}`) {
      const value = i.values[0];
      state = value === "home"
        ? { level: "home", category: null, command: null }
        : { level: "category", category: value, command: null };
    } else if (i.customId === `help:cmd:${ownerId}`) {
      state = { level: "command", category: state.category, command: i.values[0] };
    }
    current = build();
    await i.update(current);
  }

  await interaction.editReply({ components: disableAll(current.components) }).catch(() => {});
}

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse commands by category or get help for a specific command.")
    .addStringOption((o) =>
      o.setName("command").setDescription("A command to get details on").setAutocomplete(true),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const name = interaction.options.getString("command");
    if (!name) {
      await runHelpBrowser({ interaction, commands: ctx.commands, awaitFn: ctx?.awaitFn });
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
