import { SlashCommandBuilder, ChannelType } from "discord.js";
import { brandEmbed } from "../../../lib/embeds.js";
import { LIMITS } from "../../../lib/constants.js";
import { timestamps, humanizeVerification } from "../format.js";

// Counts channels by broad kind for the overview line.
function channelCounts(channels) {
  const counts = { text: 0, voice: 0, category: 0, stage: 0, other: 0 };
  for (const ch of channels.values()) {
    if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) counts.text++;
    else if (ch.type === ChannelType.GuildVoice) counts.voice++;
    else if (ch.type === ChannelType.GuildCategory) counts.category++;
    else if (ch.type === ChannelType.GuildStageVoice) counts.stage++;
    else counts.other++;
  }
  return counts;
}

export default {
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("Show details about this server."),
  permissions: [],
  async execute(interaction, _ctx) {
    const guild = interaction.guild;
    const c = channelCounts(guild.channels.cache);
    const features = guild.features.length
      ? guild.features.map((f) => `\`${f}\``).join(", ").slice(0, LIMITS.embedFieldValue)
      : "None";

    const embed = brandEmbed({ title: `${guild.name}` })
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Server ID", value: guild.id, inline: true },
        { name: "Members", value: String(guild.memberCount), inline: true },
        {
          name: "Channels",
          value: `${c.text} text · ${c.voice} voice · ${c.category} categories · ${c.stage} stage · ${c.other} other`,
        },
        { name: "Roles", value: String(Math.max(guild.roles.cache.size - 1, 0)), inline: true },
        { name: "Emojis", value: String(guild.emojis.cache.size), inline: true },
        { name: "Stickers", value: String(guild.stickers.cache.size), inline: true },
        {
          name: "Boosts",
          value: `${guild.premiumSubscriptionCount ?? 0} (Tier ${guild.premiumTier})`,
          inline: true,
        },
        { name: "Verification", value: humanizeVerification(guild.verificationLevel), inline: true },
        {
          name: "AFK",
          value: guild.afkChannelId ? `<#${guild.afkChannelId}> (${guild.afkTimeout}s)` : "None",
          inline: true,
        },
        { name: "Created", value: timestamps(guild.createdTimestamp) },
        { name: "Features", value: features },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
