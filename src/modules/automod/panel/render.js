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
import { buildPacksRow } from "./packs.js";

export const ACTIONS = [
  ["warn", "Warn"],
  ["timeout", "Timeout"],
  ["kick", "Kick"],
  ["ban", "Ban"],
  ["quarantine", "Quarantine"],
];

export function buildAutomodView(automod, packStates, ownerId) {
  const a = automod;
  const o = ownerId;

  const embed = buildAutomodEmbed(a, packStates);

  const enabledBtn = new ButtonBuilder()
    .setCustomId(`am:tog:enabled:${o}`)
    .setLabel(`${a.enabled ? EMOJIS.on : EMOJIS.off} Enabled`)
    .setStyle(a.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    enabledBtn,
    new ButtonBuilder()
      .setCustomId(`am:nav:native:${o}`)
      .setLabel(`${EMOJIS.shield} Discord AutoMod`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`am:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`am:action:${o}`)
      .setPlaceholder("Action at heat threshold")
      .addOptions(
        ACTIONS.map(([value, label]) => ({
          label,
          value,
          default: (a.thresholdAction ?? "timeout") === value,
        })),
      ),
  );

  const packsRow = buildPacksRow(packStates, o);

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

  return { embeds: [embed], components: [row1, actionRow, packsRow, rolesRow, channelsRow] };
}
