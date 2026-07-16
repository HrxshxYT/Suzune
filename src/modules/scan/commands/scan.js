import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } from "discord.js";
import { scanGuild } from "../scanner.js";
import { buildScanCard } from "../card.js";
import { buildScanEmbeds, SCAN_FILENAME } from "../render.js";

// Best-effort webhook fetch; returns [] without Manage Webhooks.
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
    .setName("scan")
    .setDescription("Run a deep security scan for threats, broken roles and misconfigurations.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  permissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 15,
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const guild = interaction.guild;

    // Warm the member cache so admin/threat detection is accurate.
    await guild.members.fetch().catch(() => {});

    const config = await ctx.config.getGuild(guild.id);
    const webhooks = await safeWebhooks(guild);
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));

    const report = scanGuild({ guild, config, webhooks, botMember });
    const png = buildScanCard({ report, guildName: guild.name });
    const file = new AttachmentBuilder(png, { name: SCAN_FILENAME });

    await interaction.editReply({
      embeds: buildScanEmbeds(report, { guildName: guild.name }),
      files: [file],
    });
  },
};
