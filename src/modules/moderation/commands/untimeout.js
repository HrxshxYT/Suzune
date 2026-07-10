import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, buildCaseEmbed } from "../helpers.js";
import { errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout early.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to release").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
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
    try {
      await targetMember.timeout(null, reason);
    } catch (err) {
      ctx.logger.error({ err }, "untimeout failed");
      await interaction.reply({
        embeds: [errorEmbed("I couldn't remove that timeout.")],
        ephemeral: true,
      });
      return;
    }
    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "untimeout",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
