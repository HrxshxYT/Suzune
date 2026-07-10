import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { parseDuration } from "../../../lib/duration.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

const MAX_SLOWMODE_SEC = 21600; // Discord max: 6 hours

export default {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set this channel's slowmode.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((o) =>
      o.setName("duration").setDescription("e.g. 10s, 5m, or 'off'").setRequired(true),
    ),
  permissions: [PermissionFlagsBits.ManageChannels],
  async execute(interaction, ctx) {
    const input = interaction.options.getString("duration");
    let seconds;
    if (input.toLowerCase() === "off" || input === "0") {
      seconds = 0;
    } else {
      const ms = parseDuration(input);
      if (!ms) {
        await interaction.reply({
          embeds: [errorEmbed("Invalid duration. Try `10s`, `5m`, or `off`.")],
          ephemeral: true,
        });
        return;
      }
      seconds = Math.min(Math.round(ms / 1000), MAX_SLOWMODE_SEC);
    }
    try {
      await interaction.channel.setRateLimitPerUser(seconds);
      await interaction.reply({
        embeds: [
          successEmbed(seconds === 0 ? "Slowmode disabled." : `Slowmode set to **${seconds}s**.`),
        ],
      });
    } catch (err) {
      ctx.logger.error({ err }, "slowmode failed");
      await interaction.reply({
        embeds: [errorEmbed("I couldn't set slowmode here.")],
        ephemeral: true,
      });
    }
  },
};
