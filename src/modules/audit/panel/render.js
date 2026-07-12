import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";
import { CATEGORIES, isOn } from "../categories.js";

export function buildAuditView(audit, ownerId) {
  const o = ownerId;
  const enabled = !!audit?.enabled;

  const embed = new EmbedBuilder()
    .setColor(enabled ? COLORS.success : COLORS.warn)
    .setTitle("📋 Audit Log Control Panel")
    .setDescription(
      `Status: ${enabled ? "🟢 ON" : "🔴 OFF"} · ` +
        `Channel: ${audit?.channelId ? `<#${audit.channelId}>` : "*not set*"}`,
    );

  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`au:chan:${o}`)
      .setPlaceholder("Log channel (setting it enables the feed)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const catButtons = CATEGORIES.map((c) =>
    new ButtonBuilder()
      .setCustomId(`au:cat:${c.key}:${o}`)
      .setLabel(`${isOn(audit, c.key) ? EMOJIS.on : EMOJIS.off} ${c.btn ?? c.label}`)
      .setStyle(isOn(audit, c.key) ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  // Chunk category buttons into rows of 5. With 11 categories that is [5,5,1];
  // append the All on/off buttons to the last (short) category row.
  const catRows = [];
  for (let i = 0; i < catButtons.length; i += 5) {
    catRows.push(catButtons.slice(i, i + 5));
  }
  const lastRow = catRows[catRows.length - 1];
  lastRow.push(
    new ButtonBuilder().setCustomId(`au:all:on:${o}`).setLabel("All on").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`au:all:off:${o}`).setLabel("All off").setStyle(ButtonStyle.Secondary),
  );

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`au:disable:${o}`)
      .setLabel("🔴 Disable feed")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`au:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Secondary),
  );

  const components = [
    channelRow,
    ...catRows.map((btns) => new ActionRowBuilder().addComponents(...btns)),
    controlRow,
  ];
  return { embeds: [embed], components };
}
