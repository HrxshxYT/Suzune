import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { parseDuration } from "../../../lib/duration.js";
import { errorEmbed, warnEmbed } from "../../../lib/embeds.js";
import { lockResultEmbed, statusEmbed } from "../embeds.js";
import { emitLockdownLog } from "../logging.js";

const TIER_SUBS = ["panic", "channels", "invites", "joins", "voice", "full"];

function tierSub(sub, name, desc, { withChannels = false } = {}) {
  sub.setName(name).setDescription(desc);
  if (withChannels) {
    sub.addChannelOption((o) =>
      o
        .setName("channels")
        .setDescription("Limit to specific channels (optional)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum),
    );
  }
  sub.addStringOption((o) => o.setName("duration").setDescription("e.g. 30m, 2h (optional)"));
  sub.addStringOption((o) => o.setName("reason").setDescription("Reason (optional)"));
  return sub;
}

export default {
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName("lockserver")
      .setDescription("Server-wide lockdown with exact-state restore.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
    b.addSubcommand((s) => tierSub(s, "panic", "Instantly strip @everyone SendMessages guild-wide."));
    b.addSubcommand((s) => tierSub(s, "channels", "Deny sending across text channels.", { withChannels: true }));
    b.addSubcommand((s) => tierSub(s, "invites", "Pause server invites (no links deleted)."));
    b.addSubcommand((s) => tierSub(s, "joins", "Raise verification to maximum."));
    b.addSubcommand((s) => tierSub(s, "voice", "Deny Connect/Speak on voice channels."));
    b.addSubcommand((s) => tierSub(s, "full", "panic + channels + invites + joins + voice."));
    b.addSubcommand((s) => s.setName("status").setDescription("Show the current lockdown state."));
    return b;
  })(),
  permissions: [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild],
  cooldown: 5,
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      const state = await ctx.lockdown.status(interaction.guildId);
      await interaction.reply({ embeds: [statusEmbed(state)], ephemeral: true });
      return;
    }

    if (!TIER_SUBS.includes(sub)) {
      await interaction.reply({ embeds: [errorEmbed("Unknown tier.")], ephemeral: true });
      return;
    }

    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    let durationMs = null;
    if (durationStr) {
      durationMs = parseDuration(durationStr);
      if (!durationMs) {
        await interaction.reply({
          embeds: [errorEmbed("Invalid duration. Try `30m`, `2h`.")],
          ephemeral: true,
        });
        return;
      }
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    const modRoleIds = guildConfig.modRoles?.map((r) => r.roleId) ?? [];
    const alertChannelId = guildConfig.antinuke?.alertChannelId ?? null;

    const channelOpt = sub === "channels" ? interaction.options.getChannel("channels") : null;
    const channelIds = channelOpt ? [channelOpt.id] : null;

    await interaction.deferReply();

    let progressAt = 0;
    const onProgress = (done, total) => {
      const now = Date.now();
      if (now - progressAt < 750 && done < total) return; // throttle edits
      progressAt = now;
      interaction
        .editReply({ embeds: [warnEmbed(`Locking… ${done}/${total} channels`)] })
        .catch(() => {});
    };

    const res = await ctx.lockdown.start({
      guild: interaction.guild,
      tier: sub,
      durationMs,
      reason,
      actorId: interaction.user.id,
      channelIds,
      modRoleIds,
      onProgress,
    });

    if (res.alreadyActive) {
      await interaction.editReply({
        embeds: [
          warnEmbed("A lockdown is already active. Run `/unlockserver` first."),
          statusEmbed(res.state),
        ],
      });
      return;
    }

    const embed = lockResultEmbed({
      tier: sub,
      reason,
      actorId: interaction.user.id,
      durationMs,
      counts: res.counts,
      failed: res.failed,
    });
    await interaction.editReply({ embeds: [embed] });
    await emitLockdownLog(ctx, interaction.guild, embed, { alertChannelId });
  },
};
