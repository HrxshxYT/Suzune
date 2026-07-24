import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { PACKS } from "./rules/packs/index.js";

export function buildAutomodEmbed(automod = {}, packStates = []) {
  const a = automod;
  const enabledPacks = packStates.filter((p) => p.enabled).length;
  return new EmbedBuilder()
    .setColor(a.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🤖 Auto-Moderation")
    .addFields(
      { name: "Enabled", value: a.enabled ? "✅ Yes" : "❌ No", inline: true },
      { name: "Heat threshold", value: `${a.heatThreshold ?? 100}`, inline: true },
      { name: "Action", value: `\`${a.thresholdAction ?? "timeout"}\``, inline: true },
      { name: "Decay", value: `${a.heatDecaySec ?? 60}s`, inline: true },
      { name: "Rule packs", value: `${enabledPacks}/${PACKS.length} enabled`, inline: true },
    );
}
