import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { COLORS } from "../../../lib/constants.js";
import { successEmbed } from "../../../lib/embeds.js";
import { paginate } from "../../../lib/components.js";
import { runPager } from "../../../lib/navigator.js";
import { buildLeaderboardEmbed } from "../leaderboardEmbed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("View invite stats and the invite leaderboard.")
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View invite stats for yourself or another member.")
        .addUserOption((o) => o.setName("user").setDescription("Member to look up")),
    )
    .addSubcommand((s) => s.setName("leaderboard").setDescription("Top inviters in this server."))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add bonus invites to a member (Manage Server).")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addIntegerOption((o) =>
          o.setName("amount").setDescription("Bonus invites").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reset")
        .setDescription("Reset a member's invites (Manage Server).")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "view") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const stats = await ctx.invites.getStats(guildId, user.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(`📨 Invites — ${user.id === interaction.user.id ? "you" : user.id}`)
        .setDescription(
          `**Total:** ${stats.total}\n` +
            `Regular: ${stats.regular} · Left: ${stats.left} · Bonus: ${stats.bonus}`,
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === "leaderboard") {
      const board = await ctx.invites.leaderboard(guildId, 50);
      const pages = paginate(board, 10);
      await runPager({
        interaction,
        count: Math.max(1, pages.length),
        render: (page) => buildLeaderboardEmbed(pages[page] ?? [], page, 10),
        ownerId: interaction.user.id,
        awaitFn: ctx?.awaitFn,
      });
      return;
    }

    // add / reset require Manage Server
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        embeds: [successEmbed("This subcommand requires the **Manage Server** permission.")],
        ephemeral: true,
      });
      return;
    }

    if (sub === "add") {
      const user = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      await ctx.invites.addBonus(guildId, user.id, amount);
      await interaction.reply({
        embeds: [successEmbed(`Gave <@${user.id}> **${amount}** bonus invite(s).`)],
      });
      return;
    }
    if (sub === "reset") {
      const user = interaction.options.getUser("user");
      await ctx.invites.reset(guildId, user.id);
      await interaction.reply({ embeds: [successEmbed(`Reset invites for <@${user.id}>.`)] });
    }
  },
};
