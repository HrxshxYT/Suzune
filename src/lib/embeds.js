import { EmbedBuilder } from "discord.js";
import { COLORS, BOT_NAME, EMOJIS } from "./constants.js";

function base(color) {
  return new EmbedBuilder().setColor(color).setFooter({ text: BOT_NAME }).setTimestamp();
}

export function successEmbed(text) {
  return base(COLORS.success).setDescription(`${EMOJIS.success} ${text}`);
}

export function errorEmbed(text) {
  return base(COLORS.error).setDescription(`${EMOJIS.error} ${text}`);
}

export function warnEmbed(text) {
  return base(COLORS.warn).setDescription(`${EMOJIS.warn} ${text}`);
}

export function infoEmbed(title, text) {
  return base(COLORS.info).setTitle(title).setDescription(text);
}

export function brandEmbed({ title, description, fields, thumbnail } = {}) {
  const e = base(COLORS.brand);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (Array.isArray(fields) && fields.length) e.addFields(fields);
  if (thumbnail) e.setThumbnail(thumbnail);
  return e;
}

export const panelEmbed = brandEmbed;
