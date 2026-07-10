import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";
import { buildAutomodEmbed } from "../statusEmbed.js";
import { runToggler } from "../../../lib/navigator.js";

const FILTER_COLUMN = {
  spam: "antiSpam",
  mentions: "antiMentionSpam",
  invites: "filterInvites",
  links: "filterLinks",
  caps: "antiCaps",
  emoji: "antiEmojiSpam",
};

export default {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure auto-moderation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("enable").setDescription("Enable auto-moderation."))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable auto-moderation."))
    .addSubcommand((s) => s.setName("view").setDescription("Show auto-moderation settings."))
    .addSubcommand((s) =>
      s.setName("panel").setDescription("Interactive dashboard to toggle filters with buttons."),
    )
    .addSubcommand((s) =>
      s
        .setName("action")
        .setDescription("What to do when a filter trips.")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Action")
            .setRequired(true)
            .addChoices(
              { name: "delete", value: "delete" },
              { name: "warn", value: "warn" },
              { name: "timeout", value: "timeout" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("filter")
        .setDescription("Toggle an individual filter.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Filter")
            .setRequired(true)
            .addChoices(
              { name: "spam", value: "spam" },
              { name: "mentions", value: "mentions" },
              { name: "invites", value: "invites" },
              { name: "links", value: "links" },
              { name: "caps", value: "caps" },
              { name: "emoji", value: "emoji" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("state")
            .setDescription("on or off")
            .setRequired(true)
            .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("exempt")
        .setDescription("Add or remove an exempt role or channel.")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("add or remove")
            .setRequired(true)
            .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }),
        )
        .addRoleOption((o) => o.setName("role").setDescription("Exempt role"))
        .addChannelOption((o) => o.setName("channel").setDescription("Exempt channel")),
    ),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "enable") {
      await ctx.config.updateAutomod(guildId, { enabled: true });
      await interaction.reply({ embeds: [successEmbed("Auto-moderation **enabled**.")] });
      return;
    }
    if (sub === "disable") {
      await ctx.config.updateAutomod(guildId, { enabled: false });
      await interaction.reply({ embeds: [successEmbed("Auto-moderation **disabled**.")] });
      return;
    }
    if (sub === "action") {
      const type = interaction.options.getString("type");
      await ctx.config.updateAutomod(guildId, { action: type });
      await interaction.reply({ embeds: [successEmbed(`Action set to \`${type}\`.`)] });
      return;
    }
    if (sub === "filter") {
      const name = interaction.options.getString("name");
      const on = interaction.options.getString("state") === "on";
      await ctx.config.updateAutomod(guildId, { [FILTER_COLUMN[name]]: on });
      await interaction.reply({
        embeds: [successEmbed(`Filter \`${name}\` **${on ? "on" : "off"}**.`)],
      });
      return;
    }
    if (sub === "exempt") {
      const action = interaction.options.getString("action");
      const role = interaction.options.getRole("role");
      const channel = interaction.options.getChannel("channel");
      const target = role ?? channel;
      if (!target) {
        await interaction.reply({
          embeds: [errorEmbed("Provide a role or a channel.")],
          ephemeral: true,
        });
        return;
      }
      const guildConfig = await ctx.config.getGuild(guildId);
      const key = role ? "exemptRoles" : "exemptChannels";
      const current = new Set(guildConfig.automod?.[key] ?? []);
      if (action === "add") current.add(target.id);
      else current.delete(target.id);
      await ctx.config.updateAutomod(guildId, { [key]: [...current] });
      await interaction.reply({
        embeds: [
          successEmbed(
            `Exempt ${role ? "role" : "channel"} ${action === "add" ? "added" : "removed"}.`,
          ),
        ],
      });
      return;
    }
    if (sub === "view") {
      const guildConfig = await ctx.config.getGuild(guildId);
      await interaction.reply({ embeds: [buildAutomodEmbed(guildConfig.automod ?? {})] });
      return;
    }
    if (sub === "panel") {
      let cfg = (await ctx.config.getGuild(guildId)).automod ?? {};
      await runToggler({
        interaction,
        ownerId: interaction.user.id,
        awaitFn: ctx?.awaitFn,
        buildItems: () =>
          Object.entries(FILTER_COLUMN).map(([key, col]) => ({ key, label: key, on: !!cfg[col] })),
        renderEmbed: () => buildAutomodEmbed(cfg),
        onToggle: async (key) => {
          const col = FILTER_COLUMN[key];
          if (!col) return;
          const next = !cfg[col];
          await ctx.config.updateAutomod(guildId, { [col]: next });
          cfg = { ...cfg, [col]: next };
        },
      });
    }
  },
};
