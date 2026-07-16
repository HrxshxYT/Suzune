import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } from "discord.js";
import { computeMetrics } from "../metrics.js";
import { buildDashboardEmbeds, CARD_FILENAME } from "../render.js";
import { buildDashboardCard } from "../card.js";

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
    .setDescription("Post a live security dashboard image that refreshes every 5 seconds.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  permissions: [PermissionFlagsBits.ManageGuild],
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    await interaction.deferReply();

    // Warm the member cache once so privileged/threat-user counts are accurate;
    // subsequent refreshes read the gateway-maintained cache.
    await guild.members.fetch().catch(() => {});

    // Renders the current snapshot into a { embeds, files } payload. The card
    // PNG is regenerated each call so the image stays live.
    const render = async () => {
      const config = await ctx.config.getGuild(guild.id);
      const webhooks = await safeWebhooks(guild);
      const metrics = computeMetrics({ guild, config, webhooks });
      const png = buildDashboardCard(metrics, { guildName: guild.name });
      const file = new AttachmentBuilder(png, { name: CARD_FILENAME });
      return { embeds: buildDashboardEmbeds(metrics, { guildName: guild.name }), files: [file] };
    };

    const message = await interaction.editReply(await render());

    // On each refresh, replace the old image (attachments: []) with a fresh one.
    ctx.dashboards.start(message, async () => ({ ...(await render()), attachments: [] }));
  },
};
