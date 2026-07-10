import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Ban then immediately unban to clear a user's recent messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to softban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const botMember = interaction.guild.members.me;
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (targetMember) {
      const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember });
      if (!check.ok) {
        await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
        return;
      }
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction && targetMember) {
      await dmTarget(
        user,
        infoEmbed(`You were softbanned from ${interaction.guild.name}`, `**Reason:** ${reason}`),
        ctx.logger,
      );
    }

    try {
      await interaction.guild.bans.create(user.id, {
        reason: `Softban: ${reason}`,
        deleteMessageSeconds: 86400,
      });
      await interaction.guild.bans.remove(user.id, "Softban (auto-unban)");
    } catch (err) {
      ctx.logger.error({ err }, "softban failed");
      await interaction.reply({
        embeds: [
          errorEmbed("I couldn't softban that user — check my permissions and role position."),
        ],
        ephemeral: true,
      });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "softban",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
