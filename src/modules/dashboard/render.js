import { EmbedBuilder } from "discord.js";

const DEV_CREDIT = "Developed by hrxshxforpresident";

// A neon-style progress bar built from block characters, mirroring the card in
// the reference screenshot.
export function integrityBar(pct, length = 18) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * length);
  return `${"█".repeat(filled)}${"░".repeat(length - filled)}`;
}

// A single grid cell: bold label over a monospace value, like the tiles on the
// dashboard card.
function tile(label, value) {
  return { name: label, value: `\`\`\`\n${value}\n\`\`\``, inline: true };
}

// Renders the live security dashboard as a rich embed. Returns an array so the
// command can spread it straight into an interaction payload.
export function buildDashboardEmbeds(metrics) {
  const m = metrics;
  const sync = Math.floor(Date.now() / 1000);

  const systems = Object.entries(m.features)
    .map(([name, on]) => `${on ? "🟢" : "🔴"} **${name}** — ${on ? "Active" : "Offline"}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(m.tier.color)
    .setTitle("🛡️ ATHENA'S SECURITY DASHBOARD")
    .setDescription(
      [
        `**Status:** ${m.tier.label}`,
        `**Last Sync:** <t:${sync}:R>`,
        `**Live Monitoring:** Active`,
        "",
        `**SYSTEM INTEGRITY INDEX**`,
        `\`${integrityBar(m.integrity)}\` **${m.integrity}%**`,
      ].join("\n"),
    )
    .addFields(
      tile("@ Roles", String(m.roles)),
      tile("★ Admin Roles", String(m.adminRoles)),
      tile("! Threat Roles", String(m.threatRoles)),
      tile("!! Perm Risk", String(m.permRisk)),
      tile("[] Channels", String(m.channels)),
      tile("+ Privileged", String(m.privileged)),
      tile("✕ Threat Users", String(m.threatUsers)),
      tile("@ Integrations", String(m.integrations)),
      tile("● Total Assets", String(m.totalAssets)),
      tile("▲ Threat Assets", String(m.threatAssets)),
      tile("👥 Members", String(m.members)),
      tile("[#] Firewall", m.firewall ? "Active" : "Offline"),
      { name: ">> Security Systems", value: systems, inline: false },
      {
        name: ">> Active Monitoring Core",
        value:
          m.threatRoles + m.threatUsers + m.threatAssets + m.permRisk === 0
            ? "> No recent security events detected."
            : "> Elevated exposure detected — review threat metrics above.",
        inline: false,
      },
    )
    .setFooter({ text: DEV_CREDIT })
    .setTimestamp();

  return [embed];
}
