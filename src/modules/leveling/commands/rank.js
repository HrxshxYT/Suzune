import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { buildRankData } from "../rankData.js";
import { buildRankCard } from "../card.js";

async function fetchAvatarPng(user) {
  const url = user.displayAvatarURL({ extension: "png", size: 256 });
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your (or someone's) level and XP.")
    .addUserOption((o) => o.setName("user").setDescription("The user (defaults to you)")),
  permissions: [],
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const user = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId;

    const [xp, rank] = await Promise.all([
      ctx.leveling.getXp(guildId, user.id),
      ctx.leveling.rankOf(guildId, user.id),
    ]);
    const data = buildRankData({ xp, rank });
    const avatarPng = await fetchAvatarPng(user);
    const png = await buildRankCard({ username: user.username, avatarPng, ...data });

    const file = new AttachmentBuilder(png, { name: "rank.png" });
    await interaction.editReply({ files: [file] });
  },
};
