import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

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

// [{ name, count }] for every category, sorted by name — powers the home card
// and the category select menu.
export function categoryCounts(commands) {
  const groups = groupByCategory(commands);
  return [...groups.entries()]
    .map(([name, names]) => ({ name, count: names.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Sorted command names within one category (empty if the category is unknown).
export function commandsInCategory(commands, category) {
  return [...(groupByCategory(commands).get(category) ?? [])].sort();
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
