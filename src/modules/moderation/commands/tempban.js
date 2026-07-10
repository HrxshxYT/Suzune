import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { parseDuration, formatDuration } from "../../../lib/duration.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Ban a user for a limited time.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) =>
      o.setName("duration").setDescription("e.g. 1h, 7d, 2w").setRequired(true),
    )
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const ms = parseDuration(durationStr);
    if (!ms) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid duration. Try `1h`, `7d`, or `2w`.")],
        ephemeral: true,
      });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (targetMember) {
      const check = checkHierarchy({
        actorMember: interaction.member,
        targetMember,
        botMember: interaction.guild.members.me,
      });
      if (!check.ok) {
        await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
        return;
      }
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction && targetMember) {
      await dmTarget(
        user,
        infoEmbed(
          `You were temporarily banned from ${interaction.guild.name}`,
          `**Duration:** ${formatDuration(ms)}\n**Reason:** ${reason}`,
        ),
        ctx.logger,
      );
    }

    try {
      await interaction.guild.bans.create(user.id, {
        reason: `Tempban (${formatDuration(ms)}): ${reason}`,
      });
    } catch (err) {
      ctx.logger.error({ err }, "tempban failed");
      await interaction.reply({
        embeds: [errorEmbed("I couldn't ban that user — check my permissions and role position.")],
        ephemeral: true,
      });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "tempban",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
      expiresAt: new Date(Date.now() + ms),
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
