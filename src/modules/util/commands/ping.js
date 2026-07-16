import { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } from "discord.js";
import { buildPingCard } from "../pingCard.js";
import { COLORS } from "../../../lib/constants.js";

function healthWord(ping) {
  if (ping < 0) return "Offline";
  if (ping <= 150) return "Excellent";
  if (ping <= 300) return "Fair";
  return "Degraded";
}

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency and health."),
  permissions: [],
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const currentPing = Math.round(interaction.client.ws.ping);
    ctx.pingHistory?.push(currentPing);
    const png = await buildPingCard({
      samples: ctx.pingHistory?.samples() ?? [],
      currentPing,
      uptimeMs: interaction.client.uptime ?? 0,
    });
    const file = new AttachmentBuilder(png, { name: "ping.png" });
    const embed = new EmbedBuilder()
      .setColor(COLORS.brand)
      .setTitle("🏓 Bot Health")
      .setDescription(
        `**Gateway:** ${currentPing < 0 ? "—" : `${currentPing}ms`} · ${healthWord(currentPing)}`,
      )
      .setImage("attachment://ping.png")
      .setFooter({ text: "Developed by hrxshxforpresident" })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed], files: [file] });
  },
};
