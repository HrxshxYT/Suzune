import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { EMOJIS } from "./constants.js";

// Discord allows at most 25 options in a string select menu.
const SELECT_MAX = 25;

export function paginate(items, pageSize) {
  const pages = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}

export function pageRow({ page, pageCount, ownerId }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`page:prev:${ownerId}`)
      .setLabel("Prev")
      .setEmoji(EMOJIS.prev)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`page:ind:${ownerId}`)
      .setLabel(`${page + 1}/${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`page:next:${ownerId}`)
      .setLabel("Next")
      .setEmoji(EMOJIS.next)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1),
  );
}

export function confirmRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:yes:${ownerId}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`confirm:no:${ownerId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function toggleRow(items, ownerId) {
  const rows = [];
  for (let i = 0; i < items.length; i += 5) {
    const chunk = items.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map((it) =>
          new ButtonBuilder()
            .setCustomId(`toggle:${it.key}:${ownerId}`)
            .setLabel(`${it.on ? EMOJIS.on : EMOJIS.off} ${it.label}`)
            .setStyle(it.on ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
      ),
    );
  }
  return rows;
}

export function ownerFilter(interaction, ownerId) {
  return interaction.user?.id === ownerId;
}

// Help category picker: a "🏠 Home" option plus one per category. `selected` is the
// active category name (falsy → Home is default). Clamped to Discord's option cap.
export function categorySelectRow({ categories, selected, ownerId }) {
  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel("🏠 Home")
      .setValue("home")
      .setDescription("Overview of every category")
      .setDefault(!selected),
    ...categories.map((cat) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(cat.name.toUpperCase().slice(0, 100))
        .setValue(cat.name)
        .setDescription(`${cat.count} command${cat.count === 1 ? "" : "s"}`.slice(0, 100))
        .setDefault(cat.name === selected),
    ),
  ].slice(0, SELECT_MAX);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help:cat:${ownerId}`)
    .setPlaceholder("Pick a category…")
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

// Help command picker: one option per command in the current category. `selected` is
// the active command name. Clamped to Discord's option cap.
export function commandSelectRow({ commands, selected, ownerId }) {
  const options = commands
    .slice(0, SELECT_MAX)
    .map((name) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`/${name}`.slice(0, 100))
        .setValue(name)
        .setDefault(name === selected),
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help:cmd:${ownerId}`)
    .setPlaceholder("Pick a command for details")
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}
