import { validatePattern, MAX_RULES_PER_GUILD } from "../rules/validate.js";
import { errorEmbed, successEmbed, infoEmbed } from "../../../lib/embeds.js";
// NOTE: successEmbed(text)/errorEmbed(text) take a single arg; titled embeds use
// infoEmbed(title, text). Confirmed against src/lib/embeds.js.

export async function handleRulesAdd(interaction, ctx) {
  const pattern = interaction.options.getString("pattern");
  const target = interaction.options.getString("target") ?? "any";
  const weight = interaction.options.getInteger("weight") ?? 20;
  const dryRun = interaction.options.getBoolean("dryrun") ?? false;

  const v = validatePattern(pattern);
  if (!v.ok) {
    return interaction.reply({ embeds: [errorEmbed(v.error)], ephemeral: true });
  }
  const existing = await ctx.config.getAutomodRules(interaction.guildId);
  if (existing.filter((r) => r.source === "custom").length >= MAX_RULES_PER_GUILD) {
    return interaction.reply({
      embeds: [errorEmbed(`You already have ${MAX_RULES_PER_GUILD} custom rules (the limit).`)],
      ephemeral: true,
    });
  }
  await ctx.config.addAutomodRule(interaction.guildId, {
    source: "custom",
    pattern,
    target,
    weight,
    deleteOnHit: true,
    dryRun,
  });
  ctx.automodRules.invalidate(interaction.guildId);
  return interaction.reply({
    embeds: [successEmbed(`Rule added${dryRun ? " (dry-run)" : ""}.`)],
    ephemeral: true,
  });
}

export async function handleRulesList(interaction, ctx) {
  const rules = (await ctx.config.getAutomodRules(interaction.guildId)).filter(
    (r) => r.source === "custom",
  );
  const lines = rules.length
    ? rules
        .map(
          (r) =>
            `\`${r.id.slice(0, 6)}\` w${r.weight} ${r.dryRun ? "[dry] " : ""}${
              r.enabled ? "" : "(disabled) "
            }\`${r.pattern}\``,
        )
        .join("\n")
    : "_No custom rules._";
  return interaction.reply({ embeds: [infoEmbed("Custom AutoMod rules", lines)], ephemeral: true });
}

export async function handleRulesRemove(interaction, ctx) {
  const id = interaction.options.getString("id");
  await ctx.config.removeAutomodRule(interaction.guildId, id);
  ctx.automodRules.invalidate(interaction.guildId);
  return interaction.reply({ embeds: [successEmbed("Rule removed.")], ephemeral: true });
}

export async function handleRulesEdit(interaction, ctx) {
  const id = interaction.options.getString("id");
  const pattern = interaction.options.getString("pattern");
  if (pattern) {
    const v = validatePattern(pattern);
    if (!v.ok) return interaction.reply({ embeds: [errorEmbed(v.error)], ephemeral: true });
  }
  const data = {};
  if (pattern) data.pattern = pattern;
  const weight = interaction.options.getInteger("weight");
  if (weight != null) data.weight = weight;
  const dryRun = interaction.options.getBoolean("dryrun");
  if (dryRun != null) data.dryRun = dryRun;
  await ctx.config.editAutomodRule(interaction.guildId, id, data);
  ctx.automodRules.invalidate(interaction.guildId);
  return interaction.reply({ embeds: [successEmbed("Rule updated.")], ephemeral: true });
}
