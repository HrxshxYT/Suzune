import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";

// DB column → human label for each logging category.
export const CATEGORIES = [
  ["memberJoinLeave", "Member Join / Leave"],
  ["messageEdit", "Message Edits"],
  ["messageDelete", "Message Deletes"],
  ["modActions", "Mod Actions"],
  ["roleChanges", "Role Changes"],
  ["channelChanges", "Channel Changes"],
  ["voice", "Voice"],
  ["serverChanges", "Server Changes"],
];

// Current routing state for a single category, used both in the embed summary
// and the picker option descriptions.
function categoryState(logging, key) {
  const disabled = new Set(logging.disabled ?? []);
  if (disabled.has(key)) return { icon: EMOJIS.off, text: "disabled" };
  const channelId = logging[key];
  if (channelId) return { icon: EMOJIS.on, text: `<#${channelId}>` };
  return { icon: "⚪", text: "unset" };
}

export function buildLoggingView(logging, ownerId, selected) {
  const o = ownerId;
  const disabled = new Set(logging.disabled ?? []);

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`${EMOJIS.log} Logging Configuration`)
    .setDescription(
      CATEGORIES.map(([key, label]) => {
        const { icon, text } = categoryState(logging, key);
        const marker = key === selected ? "▸ " : "";
        return `${icon} ${marker}**${label}** — ${text}`;
      }).join("\n"),
    )
    .setFooter({
      text: selected
        ? "Pick a channel below, or enable/disable the selected category."
        : "Select a category to configure.",
    });

  const categoryRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`lg:cat:${o}`)
      .setPlaceholder("Select a category to configure")
      .addOptions(
        CATEGORIES.map(([key, label]) => {
          const { text } = categoryState(logging, key);
          return { label, value: key, description: text.slice(0, 100), default: key === selected };
        }),
      ),
  );

  const selectedChannel = selected ? logging[selected] : null;
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`lg:chan:${o}`)
    .setPlaceholder(
      selected ? "Route this category to a channel" : "Select a category first",
    )
    .addChannelTypes(ChannelType.GuildText)
    .setMinValues(0)
    .setMaxValues(1)
    .setDisabled(!selected);
  if (selectedChannel) channelSelect.setDefaultChannels(selectedChannel);
  const channelRow = new ActionRowBuilder().addComponents(channelSelect);

  const isDisabled = selected ? disabled.has(selected) : false;
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lg:enable:${o}`)
      .setLabel("Enable")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!selected || !isDisabled),
    new ButtonBuilder()
      .setCustomId(`lg:disable:${o}`)
      .setLabel("Disable")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!selected || isDisabled),
    new ButtonBuilder()
      .setCustomId(`lg:close:${o}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [categoryRow, channelRow, buttonRow] };
}
