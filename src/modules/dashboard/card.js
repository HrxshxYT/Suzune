import { createCanvas } from "@napi-rs/canvas";
import {
  GLASS,
  tierAccent,
  paintBackground,
  glassPanel,
  accentEdge,
  drawText,
  glassBar,
  ellipsize,
} from "../../lib/glassCard.js";

const W = 1000;
const H = 848;
const P = 28;

// Renders the live master dashboard as a purple liquid-glass PNG. The whole
// card is tinted by the security tier so it reads as an at-a-glance index.
export function buildDashboardCard(metrics, { guildName = "This Server" } = {}) {
  const m = metrics;
  const accent = tierAccent(m.tier.label);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  paintBackground(ctx, W, H, accent);

  // Header.
  drawText(ctx, ellipsize(ctx, `Master Dashboard for ${guildName}`, W - 2 * P - 10, 34, "bold"), P + 14, 56, {
    size: 34,
    color: GLASS.text,
    weight: "bold",
  });
  drawText(
    ctx,
    `POSTURE: ${m.tier.label}    ·    SHIELD: ${m.firewall ? "ARMED" : "DOWN"}    ·    MEMBERS: ${m.members}    ·    SYNC: LIVE`,
    P + 16,
    88,
    { size: 16, color: GLASS.label },
  );

  // Protection-score panel.
  const ipY = 108;
  const ipH = 138;
  glassPanel(ctx, P, ipY, W - 2 * P, ipH, { radius: 22 });
  drawText(ctx, "PROTECTION SCORE", P + 28, ipY + 44, {
    size: 16,
    color: GLASS.label,
  });
  drawText(ctx, `${m.integrity}%`, P + 26, ipY + 112, {
    size: 62,
    color: accent,
    weight: "bold",
  });

  const barX = P + 320;
  const barW = W - P - barX - 28;
  glassBar(ctx, barX, ipY + 54, barW, 30, m.integrity, accent);

  // Metric grid — 4 columns × 3 rows.
  const gap = 16;
  const colW = (W - 2 * P - 3 * gap) / 4;
  const tileH = 112;
  const gridY = ipY + ipH + 22;
  const rowGap = 16;

  const threatColor = (n) => (n > 0 ? GLASS.danger : GLASS.text);
  const threatEdge = (n) => (n > 0 ? GLASS.danger : accent);

  const cells = [
    { symbol: "@", label: "TOTAL ROLES", value: m.roles, color: GLASS.text, edge: accent },
    { symbol: "★", label: "ELEVATED ROLES", value: m.adminRoles, color: GLASS.text, edge: accent },
    { symbol: "!", label: "RISKY ROLES", value: m.threatRoles, color: threatColor(m.threatRoles), edge: threatEdge(m.threatRoles) },
    { symbol: "‼", label: "EXPOSURE", value: m.permRisk, color: threatColor(m.permRisk), edge: threatEdge(m.permRisk) },
    { symbol: "#", label: "CHANNELS", value: m.channels, color: GLASS.text, edge: accent },
    { symbol: "+", label: "OPERATORS", value: m.privileged, color: GLASS.text, edge: accent },
    { symbol: "✕", label: "FLAGGED USERS", value: m.threatUsers, color: threatColor(m.threatUsers), edge: threatEdge(m.threatUsers) },
    { symbol: "@", label: "CONNECTED APPS", value: m.integrations, color: GLASS.text, edge: accent },
    { symbol: "●", label: "WEBHOOKS", value: m.totalAssets, color: GLASS.text, edge: accent },
    { symbol: "▲", label: "RISKY HOOKS", value: m.threatAssets, color: threatColor(m.threatAssets), edge: threatEdge(m.threatAssets) },
    { symbol: "»", label: "SURVEILLANCE", value: "Live", color: GLASS.accentSoft, edge: accent },
    { symbol: "▣", label: "SHIELD", value: m.firewall ? "Armed" : "Down", color: m.firewall ? GLASS.good : GLASS.danger, edge: m.firewall ? accent : GLASS.danger },
  ];

  cells.forEach((cell, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = P + col * (colW + gap);
    const y = gridY + row * (tileH + rowGap);
    glassPanel(ctx, x, y, colW, tileH, { radius: 16 });
    accentEdge(ctx, x + 12, y + 12, 5, tileH - 24, cell.edge);
    drawText(ctx, `${cell.symbol}  ${cell.label}`, x + 26, y + 36, {
      size: 15,
      color: GLASS.label,
    });
    const isText = typeof cell.value === "string";
    drawText(ctx, String(cell.value), x + 26, y + (isText ? 84 : 88), {
      size: isText ? 30 : 42,
      color: cell.color,
      weight: "bold",
    });
  });

  // Active monitoring core.
  const coreY = gridY + 3 * tileH + 2 * rowGap + 22;
  const coreH = 118;
  glassPanel(ctx, P, coreY, W - 2 * P, coreH, { radius: 20 });
  accentEdge(ctx, P + 14, coreY + 16, 5, coreH - 32, accent);
  drawText(ctx, ">> LIVE THREAT FEED", P + 28, coreY + 42, {
    size: 20,
    color: GLASS.accentSoft,
    weight: "bold",
  });
  const clean = m.threatRoles + m.threatUsers + m.threatAssets + m.permRisk === 0;
  drawText(
    ctx,
    clean
      ? "> All clear — nothing on the radar right now."
      : "> Heads up — review the flagged metrics above.",
    P + 28,
    coreY + 82,
    { size: 17, color: clean ? GLASS.muted : GLASS.danger },
  );

  // Footer credit.
  drawText(ctx, "Developed by hrxshxforpresident", W / 2, H - 22, {
    size: 16,
    color: GLASS.muted,
    align: "center",
  });

  return canvas.toBuffer("image/png");
}
