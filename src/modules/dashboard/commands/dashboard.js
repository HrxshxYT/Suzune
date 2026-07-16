import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { computeMetrics } from "../metrics.js";
import { buildDashboardEmbeds } from "../render.js";

// Best-effort fetch of guild webhooks; returns [] when the bot lacks the
// Manage Webhooks permission or the call fails, so the dashboard still renders.
async function safeWebhooks(guild) {
  try {
    const hooks = await guild.fetchWebhooks();
    return [...hooks.values()];
  } catch {
    return [];
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Post a live security dashboard that refreshes every 5 seconds.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  permissions: [PermissionFlagsBits.ManageGuild],
  async execute(interaction, ctx) {
    const guild = interaction.guild;

    // Warm the member cache once so privileged/threat-user counts are accurate;
    // subsequent refreshes read the gateway-maintained cache.
    await guild.members.fetch().catch(() => {});

    const build = async () => {
      const config = await ctx.config.getGuild(guild.id);
      const webhooks = await safeWebhooks(guild);
      const metrics = computeMetrics({ guild, config, webhooks });
      return { embeds: buildDashboardEmbeds(metrics) };
    };

    const payload = await build();
    const message = await interaction.reply({ ...payload, fetchReply: true });

    ctx.dashboards.start(message, build);
  },
};
