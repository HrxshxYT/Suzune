// src/modules/automod/commands/test.js
import { normalize } from "../pipeline/normalize.js";
import { validatePattern } from "../rules/validate.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export async function handleTest(interaction, _ctx) {
  const pattern = interaction.options.getString("pattern");
  const sample = interaction.options.getString("sample");
  const v = validatePattern(pattern);
  if (!v.ok) return interaction.reply({ embeds: [errorEmbed(v.error)], ephemeral: true });

  const variants = normalize(sample);
  const matched = ["raw", "normalized", "stripped"].filter((k) => v.re.test(variants[k]));
  const body = matched.length
    ? `✅ Matched on: **${matched.join(", ")}**\n\`\`\`\nraw:        ${variants.raw}\nnormalized: ${variants.normalized}\nstripped:   ${variants.stripped}\n\`\`\``
    : `❌ No match.\n\`\`\`\nnormalized: ${variants.normalized}\nstripped:   ${variants.stripped}\n\`\`\``;
  return interaction.reply({ embeds: [infoEmbed("Rule test", body)], ephemeral: true });
}
