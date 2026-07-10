import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the kick")),
  permissions: [PermissionFlagsBits.KickMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const botMember = interaction.guild.members.me;
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!targetMember) {
      await interaction.reply({
        embeds: [errorEmbed("That user is not in this server.")],
        ephemeral: true,
      });
      return;
    }
    const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction) {
      await dmTarget(
        user,
        infoEmbed(`You were kicked from ${interaction.guild.name}`, `**Reason:** ${reason}`),
        ctx.logger,
      );
    }

    try {
      await targetMember.kick(reason);
    } catch (err) {
      ctx.logger.error({ err }, "kick failed");
      await interaction.reply({
        embeds: [
          errorEmbed("I couldn't kick that member — check my permissions and role position."),
        ],
        ephemeral: true,
      });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "kick",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
