import { EmbedBuilder } from "discord.js";
import { LIMITS } from "../../lib/constants.js";

export const SCAN_FILENAME = "scan.png";

const SEVERITY_EMOJI = { critical: "🔴", warning: "🟠", info: "🟣" };

// Trims a list of lines to Discord's per-field limit, noting the overflow.
function fitField(lines) {
  const out = [];
  let length = 0;
  for (let i = 0; i < lines.length; i++) {
    const remaining = lines.length - i;
    const suffix = `\n…and ${remaining} more`;
    if (length + lines[i].length + 1 + (remaining > 1 ? suffix.length : 0) > LIMITS.embedFieldValue) {
      out.push(`…and ${remaining} more`);
      break;
    }
    out.push(lines[i]);
    length += lines[i].length + 1;
  }
  return out.join("\n") || "—";
}

// Builds the scan result embed: hosts the card image and lists the full set of
// findings and the concrete settings the owner/admin should enable.
export function buildScanEmbeds(report, { guildName } = {}) {
  const findingLines = report.findings.map(
    (f) => `${SEVERITY_EMOJI[f.severity]} **${f.title}** — ${f.detail}`,
  );
  const recLines = report.recommendations.map(
    (r) => (r.command ? `• ${r.label} — \`${r.command}\`` : `• ${r.label}`),
  );

  const embed = new EmbedBuilder()
    .setColor(report.tier.color)
    .setTitle(`🛡️ Security Scan — Grade ${report.grade} (${report.score}%)`)
    .setDescription(
      [
        guildName ? `**Server:** ${guildName}` : null,
        `**Posture:** ${report.tier.label}`,
        `**Findings:** 🔴 ${report.counts.critical} critical · 🟠 ${report.counts.warning} warning · 🟣 ${report.counts.info} info`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .addFields(
      {
        name: "🚨 Findings",
        value: findingLines.length ? fitField(findingLines) : "✅ No security issues detected.",
      },
      {
        name: "🧭 Recommended settings to enable",
        value: fitField(recLines),
      },
    )
    .setImage(`attachment://${SCAN_FILENAME}`)
    .setFooter({ text: "Developed by hrxshxforpresident" })
    .setTimestamp();

  return [embed];
}
