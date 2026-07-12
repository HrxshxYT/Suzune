import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";
import { buildWhitelistEmbed } from "../statusEmbed.js";
import {
  WL_LIMIT_CHOICES,
  WL_WINDOW_CHOICES,
  WATCHED_ACTIONS,
  ACTION_LABELS,
  getWhitelistLimit,
} from "../config.js";

export const PUNISHMENTS = [
  ["ban", "Ban"],
  ["kick", "Kick"],
  ["strip", "Strip roles"],
  ["quarantine", "Quarantine"],
  ["removeperms", "Remove perms"],
];

export function buildMainView(state) {
  const a = state.antinuke;
  const o = state.ownerId;

  const embed = new EmbedBuilder()
    .setColor(a.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🛡️ Anti-Nuke Control Panel")
    .setDescription(
      `${a.enabled ? "🟢 ON" : "🔴 OFF"} · Punish: \`${a.punishment ?? "ban"}\`\n` +
        `Alert: ${a.alertChannelId ? `<#${a.alertChannelId}>` : "*none*"} · ` +
        `Quarantine: ${a.quarantineRoleId ? `<@&${a.quarantineRoleId}>` : "*none*"}\n` +
        `Anti-raid: ${
          a.antiRaidEnabled ? `on (${a.raidJoinCount ?? 10} joins / ${a.raidWindowSec ?? 10}s)` : "off"
        } · Whitelist: ${state.whitelist.length}`,
    );

  const toggle = (field, label) =>
    new ButtonBuilder()
      .setCustomId(`an:tog:${field}:${o}`)
      .setLabel(`${a[field] ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(a[field] ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    toggle("enabled", "Enabled"),
    toggle("panicMode", "Panic"),
    toggle("autoRevert", "Auto-revert"),
    toggle("antiRaidEnabled", "Anti-raid"),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`an:sel:punishment:${o}`)
      .setPlaceholder("Punishment on detection")
      .addOptions(
        PUNISHMENTS.map(([value, label]) => ({
          label,
          value,
          default: (a.punishment ?? "ban") === value,
        })),
      ),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`an:sel:alert:${o}`)
      .setPlaceholder("Alert channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`an:sel:qrole:${o}`)
      .setPlaceholder("Quarantine role")
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`an:adv:${o}`).setLabel("Advanced…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`an:wl:open:${o}`).setLabel("Whitelist").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`an:wll:open:${o}`)
      .setLabel(`${a.whitelistLimitEnabled ? EMOJIS.on : EMOJIS.off} WL Limits`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`an:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

// Per-action whitelist-limit configuration sub-view (drill-down). `state.wlAction`
// holds the action key currently being edited (null until one is picked).
export function buildWhitelistLimitsView(state) {
  const a = state.antinuke;
  const o = state.ownerId;
  const master = !!a.whitelistLimitEnabled;

  const configured = WATCHED_ACTIONS.map(([key]) => [key, getWhitelistLimit(a, key)])
    .filter(([, wl]) => wl.enabled)
    .map(([key, wl]) => `\`${ACTION_LABELS[key]}\` ${wl.limit}/${wl.windowSec}s`);

  const embed = new EmbedBuilder()
    .setColor(master ? COLORS.success : COLORS.warn)
    .setTitle("🛡️ Anti-Nuke · Whitelist Limits")
    .setDescription(
      `Trip whitelisted users who exceed a per-action limit.\n` +
        `Feature: ${master ? "🟢 ON" : "🔴 OFF"}\n\n` +
        `**Configured:** ${configured.length ? configured.join(" · ") : "*none yet*"}`,
    );

  const masterRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`an:wll:toggle:${o}`)
      .setLabel(`${master ? EMOJIS.on : EMOJIS.off} Feature ${master ? "ON" : "OFF"}`)
      .setStyle(master ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const pickRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`an:wll:pick:${o}`)
      .setPlaceholder("Pick an action to configure…")
      .addOptions(
        WATCHED_ACTIONS.map(([key, label]) => ({
          label,
          value: key,
          default: state.wlAction === key,
        })),
      ),
  );

  const rows = [masterRow, pickRow];

  if (state.wlAction) {
    const wl = getWhitelistLimit(a, state.wlAction);
    const label = ACTION_LABELS[state.wlAction] ?? state.wlAction;

    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`an:wll:limit:${o}`)
          .setPlaceholder(`Limit for ${label}`)
          .addOptions(
            WL_LIMIT_CHOICES.map((n) => ({
              label: `${n} actions`,
              value: String(n),
              default: wl.limit === n,
            })),
          ),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`an:wll:window:${o}`)
          .setPlaceholder(`Window for ${label}`)
          .addOptions(
            WL_WINDOW_CHOICES.map((n) => ({
              label: `${n}s`,
              value: String(n),
              default: wl.windowSec === n,
            })),
          ),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`an:wll:actog:${o}`)
          .setLabel(`${wl.enabled ? EMOJIS.on : EMOJIS.off} ${label}`)
          .setStyle(wl.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`an:wll:back:${o}`).setLabel("◀ Back").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`an:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`an:wll:back:${o}`).setLabel("◀ Back").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`an:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
      ),
    );
  }

  return { embeds: [embed], components: rows };
}

export function buildWhitelistView(state) {
  const o = state.ownerId;
  const canEdit = state.serverOwnerId === o;
  const embed = buildWhitelistEmbed(state.whitelist);
  if (!canEdit) {
    embed.setFooter({ text: "🔒 Only the server owner can change the whitelist." });
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new MentionableSelectMenuBuilder()
        .setCustomId(`an:wl:add:${o}`)
        .setPlaceholder("Add a user or role…")
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(!canEdit),
    ),
  ];

  if (state.whitelist.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`an:wl:remove:${o}`)
          .setPlaceholder("Remove an entry…")
          .setDisabled(!canEdit)
          .addOptions(
            state.whitelist.slice(0, 25).map((e) => ({
              label: `${e.type === "role" ? "Role" : "User"} ${e.targetId}`,
              value: e.targetId,
            })),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`an:wl:back:${o}`).setLabel("◀ Back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`an:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
    ),
  );

  return { embeds: [embed], components: rows };
}
