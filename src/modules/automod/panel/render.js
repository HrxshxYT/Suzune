import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { EMOJIS } from "../../../lib/constants.js";
import { buildAutomodEmbed } from "../statusEmbed.js";

// DB column → short button label for each message filter.
export const FILTERS = [
  ["antiSpam", "spam"],
  ["antiMentionSpam", "mentions"],
  ["filterInvites", "invites"],
  ["filterLinks", "links"],
  ["antiCaps", "caps"],
  ["antiEmojiSpam", "emoji"],
];

export const ACTIONS = [
  ["delete", "Delete message"],
  ["warn", "Warn"],
  ["timeout", "Timeout"],
];

export function buildAutomodView(automod, ownerId) {
  const a = automod;
  const o = ownerId;

  const embed = buildAutomodEmbed(a).addFields({
    name: "Exempt",
    value: `${(a.exemptRoles ?? []).length} roles · ${(a.exemptChannels ?? []).length} channels`,
    inline: true,
  });

  const filterBtn = ([col, label]) =>
    new ButtonBuilder()
      .setCustomId(`am:tog:${col}:${o}`)
      .setLabel(`${a[col] ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(a[col] ? ButtonStyle.Success : ButtonStyle.Secondary);

  const enabledBtn = new ButtonBuilder()
    .setCustomId(`am:tog:enabled:${o}`)
    .setLabel(`${a.enabled ? EMOJIS.on : EMOJIS.off} Enabled`)
    .setStyle(a.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);

  // Row 1: enable toggle + first 4 filters. Row 2: last 2 filters + Close.
  const row1 = new ActionRowBuilder().addComponents(
    enabledBtn,
    ...FILTERS.slice(0, 4).map(filterBtn),
  );
  const row2 = new ActionRowBuilder().addComponents(
    ...FILTERS.slice(4).map(filterBtn),
    new ButtonBuilder().setCustomId(`am:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`am:action:${o}`)
      .setPlaceholder("Action when a filter trips")
      .addOptions(
        ACTIONS.map(([value, label]) => ({
          label,
          value,
          default: (a.action ?? "delete") === value,
        })),
      ),
  );

  const rolesRow = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`am:exroles:${o}`)
      .setPlaceholder("Exempt roles (select all that apply)")
      .setMinValues(0)
      .setMaxValues(25)
      .setDefaultRoles(...(a.exemptRoles ?? [])),
  );

  const channelsRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`am:exchans:${o}`)
      .setPlaceholder("Exempt channels (select all that apply)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(0)
      .setMaxValues(25)
      .setDefaultChannels(...(a.exemptChannels ?? [])),
  );

  return { embeds: [embed], components: [row1, row2, actionRow, rolesRow, channelsRow] };
}
