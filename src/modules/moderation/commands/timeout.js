import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { parseDuration, formatDuration } from "../../../lib/duration.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

const MAX_TIMEOUT_MS = 28 * 86400 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Temporarily mute a member using Discord's native timeout.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to time out").setRequired(true))
    .addStringOption((o) =>
      o.setName("duration").setDescription("e.g. 10m, 2h, 7d (max 28d)").setRequired(true),
    )
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const ms = parseDuration(durationStr);
    if (!ms) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid duration. Try `10m`, `2h`, or `7d`.")],
        ephemeral: true,
      });
      return;
    }
    if (ms > MAX_TIMEOUT_MS) {
      await interaction.reply({
        embeds: [errorEmbed("Timeouts can be at most 28 days.")],
        ephemeral: true,
      });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({
        embeds: [errorEmbed("That user is not in this server.")],
        ephemeral: true,
      });
      return;
    }
    const check = checkHierarchy({
      actorMember: interaction.member,
      targetMember,
      botMember: interaction.guild.members.me,
    });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction) {
      await dmTarget(
        user,
        infoEmbed(
          `You were timed out in ${interaction.guild.name}`,
          `**Duration:** ${formatDuration(ms)}\n**Reason:** ${reason}`,
        ),
        ctx.logger,
      );
    }

    try {
      await targetMember.timeout(ms, reason);
    } catch (err) {
      ctx.logger.error({ err }, "timeout failed");
      await interaction.reply({
        embeds: [
          errorEmbed("I couldn't time out that member — check my permissions and role position."),
        ],
        ephemeral: true,
      });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "timeout",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
      expiresAt: new Date(Date.now() + ms),
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
