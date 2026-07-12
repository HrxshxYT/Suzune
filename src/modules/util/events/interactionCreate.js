import { Events } from "discord.js";
import { canUseCommand } from "../../../core/PermissionService.js";
import { runSafely } from "../../../core/Errors.js";
import { errorEmbed } from "../../../lib/embeds.js";

export default {
  name: Events.InteractionCreate,
  async execute(ctx, interaction) {
    if (interaction.isAutocomplete?.()) {
      const command = ctx.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction, ctx);
        } catch (err) {
          ctx.logger.error({ err }, "autocomplete failed");
        }
      }
      return;
    }
    // All message components (buttons + every select) and modal submits are
    // owned by per-message collectors inside commands, never the global router.
    if (interaction.isMessageComponent?.() || interaction.isModalSubmit?.()) return;

    if (!interaction.isChatInputCommand()) return;
    const command = ctx.commands.get(interaction.commandName);
    if (!command) return;

    const guild = interaction.guildId ? await ctx.config.getGuild(interaction.guildId) : null;
    const modRoleIds = guild?.modRoles?.map((r) => r.roleId) ?? [];

    const perm = canUseCommand({ member: interaction.member, command, modRoleIds });
    if (!perm.ok) {
      await interaction.reply({
        embeds: [errorEmbed("You don't have permission to use that command.")],
        ephemeral: true,
      });
      return;
    }

    const cd = ctx.cooldowns.check(
      command.data.name,
      interaction.user?.id ?? interaction.member.id,
      command.cooldown ?? 3,
    );
    if (cd.limited) {
      await interaction.reply({
        embeds: [errorEmbed(`Slow down — try again in ${Math.ceil(cd.retryAfterMs / 1000)}s.`)],
        ephemeral: true,
      });
      return;
    }

    await runSafely({
      fn: () => command.execute(interaction, ctx),
      interaction,
      logger: ctx.logger,
    });
  },
};
