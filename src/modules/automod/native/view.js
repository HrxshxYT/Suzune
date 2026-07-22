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

// Rule toggle buttons: config column → short label.
const RULES = [
  ["nativeInvites", "invites"],
  ["nativeMentions", "mentions"],
  ["nativeSpam", "spam"],
  ["nativePresets", "profanity"],
];

// Timeout durations offered in the punishment select (seconds → label).
export const TIMEOUTS = [
  [60, "1 minute"],
  [300, "5 minutes"],
  [600, "10 minutes"],
  [3600, "1 hour"],
  [86400, "1 day"],
  [604800, "1 week"],
];

function durationLabel(sec) {
  return TIMEOUTS.find(([s]) => s === sec)?.[1] ?? `${sec}s`;
}

function summarizeSync(res) {
  if (!res) return null;
  if (res.ok === false) {
    const why =
      res.reason === "missing_permission"
        ? "I need the **Manage Server** permission to manage AutoMod rules."
        : "Couldn't reach Discord's AutoMod API. Try again.";
    return `${EMOJIS.error} ${why}`;
  }
  const parts = [];
  if (res.created) parts.push(`${res.created} created`);
  if (res.updated) parts.push(`${res.updated} updated`);
  if (res.removed) parts.push(`${res.removed} removed`);
  if (res.failed) parts.push(`${res.failed} failed`);
  return `${EMOJIS.success} Synced — ${parts.length ? parts.join(", ") : "no changes"}.`;
}

export function buildNativeEmbed(a, lastSync) {
  const punishments = [
    `${EMOJIS.on} Block message`,
    a.nativeAlert
      ? `${EMOJIS.on} Alert${a.nativeAlertChannelId ? ` → <#${a.nativeAlertChannelId}>` : " (no channel set)"}`
      : `${EMOJIS.off} Alert`,
    a.nativeTimeout
      ? `${EMOJIS.on} Timeout → ${durationLabel(a.nativeTimeoutSeconds ?? 300)} _(invites & mentions only)_`
      : `${EMOJIS.off} Timeout`,
  ].join("\n");

  const rules = RULES.map(([col, label]) => `${a[col] ? EMOJIS.on : EMOJIS.off} ${label}`).join(
    "  ·  ",
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(`${EMOJIS.shield} Discord AutoMod (native)`)
    .setDescription(
      "Provisions real Discord Auto Moderation rules via the API — they block at Discord's edge (before the message posts) and earn the **Uses AutoMod** badge.\n\n" +
        "Toggle the rules and punishments, then press **Sync now** to apply them.",
    )
    .addFields(
      { name: "Status", value: a.nativeEnabled ? `${EMOJIS.on} Enabled` : `${EMOJIS.off} Disabled` },
      { name: "Rules", value: rules },
      { name: "Punishments", value: punishments },
    );

  const note = summarizeSync(lastSync);
  if (note) embed.addFields({ name: "Last sync", value: note });
  return embed;
}

export function buildNativeView(a, ownerId, lastSync) {
  const o = ownerId;
  const toggle = (id, on, label, style = null) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(`${on ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(style ?? (on ? ButtonStyle.Success : ButtonStyle.Secondary));

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`am:nav:main:${o}`)
      .setLabel(`${EMOJIS.prev} Back`)
      .setStyle(ButtonStyle.Secondary),
    toggle(`am:ntog:nativeEnabled:${o}`, a.nativeEnabled, "Enabled"),
    toggle(`am:ntog:nativeAlert:${o}`, a.nativeAlert, "Alert"),
    toggle(`am:ntog:nativeTimeout:${o}`, a.nativeTimeout, "Timeout"),
  );

  const row2 = new ActionRowBuilder().addComponents(
    ...RULES.map(([col, label]) => toggle(`am:ntog:${col}:${o}`, a[col], label)),
  );

  const timeoutRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`am:ntimeout:${o}`)
      .setPlaceholder("Timeout duration (for invites & mention spam)")
      .addOptions(
        TIMEOUTS.map(([value, label]) => ({
          label,
          value: String(value),
          default: (a.nativeTimeoutSeconds ?? 300) === value,
        })),
      ),
  );

  const alertRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`am:nalertch:${o}`)
      .setPlaceholder("Alert channel (where blocks are reported)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(0)
      .setMaxValues(1)
      .setDefaultChannels(...(a.nativeAlertChannelId ? [a.nativeAlertChannelId] : [])),
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`am:nsync:${o}`)
      .setLabel("Sync now")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`am:nremove:${o}`)
      .setLabel("Remove rules")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`am:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [buildNativeEmbed(a, lastSync)],
    components: [row1, row2, timeoutRow, alertRow, actionsRow],
  };
}
