import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { COLORS } from "../../../lib/constants.js";
import { buildId, KINDS } from "../constants.js";

export function buildPublishedPanel(panel) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(panel.title)
    .setDescription(panel.description);

  const select = new StringSelectMenuBuilder()
    .setCustomId(buildId(KINDS.OPEN, panel.id))
    .setPlaceholder("Select a category…");

  const categories = panel.categories ?? [];
  if (categories.length === 0) {
    select
      .setDisabled(true)
      .addOptions(new StringSelectMenuOptionBuilder().setLabel("No categories configured").setValue("none"));
  } else {
    select.addOptions(
      categories.map((c) => {
        const opt = new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(c.id);
        if (c.description) opt.setDescription(c.description.slice(0, 100));
        if (c.emoji) opt.setEmoji(c.emoji);
        return opt;
      }),
    );
  }

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}
