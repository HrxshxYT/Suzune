import { EmbedBuilder } from "discord.js";

const DEV_CREDIT = "Developed by hrxshxforpresident";
export const CARD_FILENAME = "dashboard.png";

// A neon-style progress bar built from block characters, used in the embed's
// text fallback so the integrity index is still readable without the image.
export function integrityBar(pct, length = 18) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * length);
  return `${"█".repeat(filled)}${"░".repeat(length - filled)}`;
}

// Hosts the rendered dashboard card image. The image carries the full metric
// grid; the embed adds a searchable/accessible text summary of the posture, the
// live security toggles and the member count, plus the dev-credit footer.
export function buildDashboardEmbeds(metrics, { guildName } = {}) {
  const m = metrics;
  const sync = Math.floor(Date.now() / 1000);

  const systems = Object.entries(m.features)
    .map(([name, on]) => `${on ? "🟢" : "🔴"} **${name}** — ${on ? "Active" : "Offline"}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(m.tier.color)
    .setTitle(`🛡️ Master Dashboard for ${guildName ?? "This Server"}`)
    .setDescription(
      [
        `**Posture:** ${m.tier.label}`,
        `**Shield:** ${m.firewall ? "Armed" : "Down"}`,
        `**Members:** ${m.members}`,
        `**Last Sync:** <t:${sync}:R>`,
        `**Surveillance:** Live`,
        "",
        `**Protection Score:** \`${integrityBar(m.integrity)}\` ${m.integrity}%`,
      ].join("\n"),
    )
    .addFields({ name: ">> Active Defenses", value: systems, inline: false })
    .setImage(`attachment://${CARD_FILENAME}`)
    .setFooter({ text: DEV_CREDIT })
    .setTimestamp();

  return [embed];
}
