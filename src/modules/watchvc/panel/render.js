import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";

export function buildWatchVcView(state) {
  const w = state.watchVc;
  const o = state.ownerId;

  const embed = new EmbedBuilder()
    .setColor(w.enabled ? COLORS.success : COLORS.warn)
    .setTitle(`${EMOJIS.shield} Watch VC — Guard Panel`)
    .setDescription(
      `**State:** ${w.enabled ? `${EMOJIS.on} guarding` : `${EMOJIS.off} off`}\n` +
        `**Channel:** ${w.channelId ? `<#${w.channelId}>` : "*none selected*"}\n\n` +
        "The bot sits silently in the chosen voice channel (unmuted, no sound), " +
        "locks it so everyone can see it but nobody can connect, and shows a live " +
        "`🛡️ Guarding N members` status.\n\n" +
        "Requires the bot to have **Manage Channels**, **Connect**, and **View Channel**.",
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`wv:ch:${o}`)
      .setPlaceholder("Voice channel to guard")
      .addChannelTypes(ChannelType.GuildVoice)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wv:toggle:${o}`)
      .setLabel(w.enabled ? `${EMOJIS.on} Guarding` : `${EMOJIS.off} Enable`)
      .setStyle(w.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!w.channelId),
    new ButtonBuilder()
      .setCustomId(`wv:reassert:${o}`)
      .setLabel("Re-assert")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!w.enabled),
    new ButtonBuilder()
      .setCustomId(`wv:close:${o}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2] };
}
