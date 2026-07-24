import { infoEmbed } from "../../../lib/embeds.js";

export async function handleLogs(interaction, ctx) {
  const rows = await ctx.config.getAutomodLogs(interaction.guildId, 20);
  const body = rows.length
    ? rows.map((r) =>
        `<@${r.userId}> · \`${r.source}\` → ${r.dryRun ? "**dry-run**" : r.action} · heat ${r.heatAfter}`,
      ).join("\n")
    : "_No AutoMod hits recorded yet._";
  return interaction.reply({ embeds: [infoEmbed("Recent AutoMod hits", body)], ephemeral: true });
}
