import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";

const REWARD_LEVELS = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50];

export function buildMainView(state) {
  const a = state.leveling;
  const o = state.ownerId;

  const embed = new EmbedBuilder()
    .setColor(a.enabled ? COLORS.success : COLORS.warn)
    .setTitle("⭐ Leveling Control Panel")
    .setDescription(
      `${a.enabled ? "🟢 ON" : "🔴 OFF"} · Announce: ${a.announce ? "on" : "off"}\n` +
        `XP per message: **${a.xpMin}–${a.xpMax}** every **${a.cooldownSec}s**\n` +
        `Ignored: ${(a.ignoredChannels ?? []).length} channels · ${(a.ignoredRoles ?? []).length} roles · ` +
        `Rewards: ${state.rewards.length}`,
    );

  const toggle = (field, label) =>
    new ButtonBuilder()
      .setCustomId(`lv:tog:${field}:${o}`)
      .setLabel(`${a[field] ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(a[field] ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    toggle("enabled", "Enabled"),
    toggle("announce", "Announce"),
    new ButtonBuilder().setCustomId(`lv:xp:${o}`).setLabel("XP settings…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`lv:rewards:${o}`).setLabel("Rewards…").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`lv:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`lv:ign:channels:${o}`)
      .setPlaceholder("Ignored channels (no XP)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(0)
      .setMaxValues(25),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`lv:ign:roles:${o}`)
      .setPlaceholder("Ignored roles (no XP)")
      .setMinValues(0)
      .setMaxValues(25),
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

export function buildRewardsView(state) {
  const o = state.ownerId;
  const pending = state.pendingRoleId;

  const lines = state.rewards.length
    ? state.rewards.map((r) => `Level **${r.level}** → <@&${r.roleId}>`).join("\n")
    : "*No rewards yet.*";

  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle("⭐ Leveling · Role Rewards")
    .setDescription(
      `${lines}\n\n` +
        (pending
          ? `Selected role <@&${pending}> — now pick the level to grant it at.`
          : "Pick a role, then a level to grant it at."),
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`lv:rw:role:${o}`)
        .setPlaceholder("Reward role…")
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`lv:rw:level:${o}`)
        .setPlaceholder("Grant at level…")
        .setDisabled(!pending)
        .addOptions(REWARD_LEVELS.map((n) => ({ label: `Level ${n}`, value: String(n) }))),
    ),
  ];

  if (state.rewards.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`lv:rw:remove:${o}`)
          .setPlaceholder("Remove a reward…")
          .addOptions(
            state.rewards.slice(0, 25).map((r) => ({ label: `Level ${r.level}`, value: String(r.level) })),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`lv:back:${o}`).setLabel("◀ Back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`lv:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
    ),
  );

  return { embeds: [embed], components: rows };
}
