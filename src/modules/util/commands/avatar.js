import { SlashCommandBuilder } from "discord.js";
import { brandEmbed } from "../../../lib/embeds.js";

export function avatarLinks(user) {
  const formats = user.avatar?.startsWith("a_")
    ? ["png", "jpg", "webp", "gif"]
    : ["png", "jpg", "webp"];
  return formats
    .map((f) => `[${f === "webp" ? "WebP" : f.toUpperCase()}](${user.displayAvatarURL({ extension: f, size: 512 })})`)
    .join(" · ");
}

export default {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar.")
    .addUserOption((o) => o.setName("user").setDescription("The user (defaults to you)")),
  permissions: [],
  async execute(interaction, _ctx) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const user = await target.fetch().catch(() => target);
    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);

    const embed = brandEmbed({ title: `${user.tag}'s avatar` })
      .setImage(user.displayAvatarURL({ size: 512 }))
      .setDescription(avatarLinks(user));

    if (member?.avatar) {
      embed.addFields({
        name: "Server avatar",
        value: `[View](${member.displayAvatarURL({ size: 512 })})`,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
