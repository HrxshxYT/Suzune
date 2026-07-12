import { SlashCommandBuilder } from "discord.js";
import { brandEmbed } from "../../../lib/embeds.js";
import {
  timestamps,
  humanizePresence,
  keyPermissions,
  humanizeFlags,
} from "../format.js";

const MAX_ROLES = 15;

// Roles the member holds, highest first, excluding @everyone, as mentions.
function roleMentions(member) {
  const roles = [...member.roles.cache.values()]
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);
  if (!roles.length) return { count: 0, value: "None" };
  const shown = roles.slice(0, MAX_ROLES).map((r) => `<@&${r.id}>`);
  const extra = roles.length - shown.length;
  return {
    count: roles.length,
    value: shown.join(" ") + (extra > 0 ? ` … +${extra} more` : ""),
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show details about a user.")
    .addUserOption((o) => o.setName("user").setDescription("The user (defaults to you)")),
  permissions: [],
  async execute(interaction, _ctx) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    // Fetch to populate badge flags and banner, which aren't on the cached user.
    const user = await target.fetch().catch(() => target);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const embed = brandEmbed({ title: `${user.tag}${user.bot ? " 🤖" : ""}` })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "User ID", value: user.id, inline: true },
        { name: "Account created", value: timestamps(user.createdTimestamp) },
      );

    if (member) {
      embed.addFields({ name: "Status", value: humanizePresence(member.presence?.status), inline: true });
      if (member.nickname) embed.addFields({ name: "Nickname", value: member.nickname, inline: true });
      if (member.joinedTimestamp) {
        embed.addFields({ name: "Joined server", value: timestamps(member.joinedTimestamp) });
      }
      const roles = roleMentions(member);
      embed.addFields({ name: `Roles (${roles.count})`, value: roles.value });
      const perms = keyPermissions(member.permissions);
      if (perms.length) embed.addFields({ name: "Key permissions", value: perms.join(", ") });
    } else {
      embed.addFields({ name: "Joined server", value: "Not in this server" });
    }

    const badges = humanizeFlags(user.flags);
    if (badges.length) embed.addFields({ name: "Badges", value: badges.join(", ") });

    const banner = user.bannerURL?.({ size: 512 });
    if (banner) embed.setImage(banner);

    await interaction.reply({ embeds: [embed] });
  },
};
