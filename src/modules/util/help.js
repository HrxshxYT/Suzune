import { EmbedBuilder } from "discord.js";
import { COLORS, BOT_NAME } from "../../lib/constants.js";
import { brandEmbed } from "../../lib/embeds.js";

function groupByCategory(commands) {
  const groups = new Map();
  for (const command of commands.values()) {
    const category = command.category ?? "other";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(command.data.name);
  }
  return groups;
}

export function categoryNames(commands) {
  return [...groupByCategory(commands).keys()].sort();
}

export function buildCategoryEmbed(commands, index) {
  const names = categoryNames(commands);
  const i = Math.max(0, Math.min(names.length - 1, index));
  const category = names[i];
  const cmds = (groupByCategory(commands).get(category) ?? []).sort();
  return brandEmbed({
    title: `${BOT_NAME} — ${category}  ·  ${i + 1}/${names.length}`,
    description:
      cmds.map((n) => `\`/${n}\``).join("  ") + "\n\nUse `/help <command>` for details on any one.",
  });
}

export function buildHelpOverviewEmbed(commands) {
  const groups = new Map();
  for (const command of commands.values()) {
    const category = command.category ?? "other";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(command.data.name);
  }
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`📖 ${BOT_NAME} — Commands`)
    .setDescription("Use `/help <command>` for details on any command.")
    .setFooter({ text: BOT_NAME });
  for (const [category, names] of [...groups.entries()].sort()) {
    embed.addFields({
      name: `${category} (${names.length})`,
      value: names
        .sort()
        .map((n) => `\`${n}\``)
        .join(", "),
    });
  }
  return embed;
}

export function buildHelpDetailEmbed(command) {
  const needsPerms = (command.permissions ?? []).length > 0;
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`/${command.data.name}`)
    .setDescription(command.data.description ?? "No description.")
    .addFields(
      { name: "Category", value: command.category ?? "other", inline: true },
      {
        name: "Access",
        value: needsPerms ? "Requires elevated permissions" : "Everyone",
        inline: true,
      },
    );
}
