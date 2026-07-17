import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { buildDashboardPayload, registerDashboard } from "../live.js";

export default {
  data: new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Post a live security dashboard that keeps refreshing until deleted.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  permissions: [PermissionFlagsBits.ManageGuild],
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    await interaction.deferReply();

    // Warm the member cache once so privileged/threat-user counts are accurate;
    // subsequent refreshes read the gateway-maintained cache.
    await guild.members.fetch().catch(() => {});

    const message = await interaction.editReply(await buildDashboardPayload(guild, ctx));

    // Persist + start the loop; it survives restarts and runs until deleted.
    await registerDashboard(ctx, message, guild);
  },
};
