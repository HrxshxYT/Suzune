import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { errorEmbed, warnEmbed } from "../../../lib/embeds.js";
import { unlockResultEmbed } from "../embeds.js";
import { emitLockdownLog } from "../logging.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unlockserver")
    .setDescription("Lift the active server-wide lockdown, restoring exact prior permissions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  permissions: [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild],
  cooldown: 5,
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const res = await ctx.lockdown.unlock({
      guild: interaction.guild,
      actorId: interaction.user.id,
    });

    if (!res.ok && res.reason === "none") {
      await interaction.editReply({ embeds: [warnEmbed("There is no active lockdown.")] });
      return;
    }
    if (!res.ok && res.reason === "corrupt") {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "The lockdown snapshot is missing or corrupt. I won't guess at your permissions — " +
              "restore them manually and check the audit log. The lockdown record was left intact.",
          ),
        ],
      });
      return;
    }
    if (!res.ok && res.reason === "partial") {
      await interaction.editReply({
        embeds: [
          unlockResultEmbed({ actorId: interaction.user.id, counts: {}, failed: res.failed }),
          warnEmbed("Some channels could not be restored — fix my permissions and run `/unlockserver` again."),
        ],
      });
      return;
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    const alertChannelId = guildConfig.antinuke?.alertChannelId ?? null;
    const embed = unlockResultEmbed({
      actorId: interaction.user.id,
      counts: res.counts,
      failed: res.failed,
    });
    await interaction.editReply({ embeds: [embed] });
    await emitLockdownLog(ctx, interaction.guild, embed, { alertChannelId });
  },
};
