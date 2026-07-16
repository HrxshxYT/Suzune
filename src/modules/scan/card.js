import { createCanvas } from "@napi-rs/canvas";
import {
  GLASS,
  tierAccent,
  hexToRgba,
  paintBackground,
  glassPanel,
  accentEdge,
  drawText,
  glassBar,
} from "../../lib/glassCard.js";

const W = 1000;
const H = 764;
const P = 28;

const SEVERITY = {
  critical: GLASS.danger,
  warning: "#fb923c",
  info: GLASS.accent,
};

function ellipsize(ctx, text, maxWidth, font) {
  ctx.save();
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.restore();
    return text;
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  ctx.restore();
  return `${out}…`;
}

// Renders the security scan report as a purple liquid-glass PNG: a grade badge,
// severity counts, an analytics strip, top findings, and recommendations.
export function buildScanCard({ report, guildName = "This Server" }) {
  const accent = tierAccent(report.tier.label);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  paintBackground(ctx, W, H, accent);

  // Header.
  drawText(ctx, "SECURITY SCAN REPORT", P + 14, 54, { size: 32, color: GLASS.text, weight: "bold" });
  drawText(
    ctx,
    ellipsize(ctx, `${guildName}  ·  ${report.findings.length} findings  ·  posture: ${report.tier.label}`, W - 2 * P - 20, `16px sans-serif`),
    P + 16,
    84,
    { size: 16, color: GLASS.label },
  );

  // Grade + score panel (left).
  const gpW = 300;
  const gpY = 104;
  const gpH = 200;
  glassPanel(ctx, P, gpY, gpW, gpH, { radius: 22 });
  // Grade badge circle.
  const bcx = P + 86;
  const bcy = gpY + gpH / 2;
  ctx.beginPath();
  ctx.arc(bcx, bcy, 62, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(accent, 0.16);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.stroke();
  drawText(ctx, report.grade, bcx, bcy + 20, { size: 56, color: accent, weight: "bold", align: "center" });
  drawText(ctx, "SECURITY GRADE", P + 24, gpY + gpH - 26, { size: 13, color: GLASS.muted });
  drawText(ctx, `${report.score}%`, P + 176, gpY + 96, { size: 52, color: GLASS.text, weight: "bold" });
  drawText(ctx, report.tier.label, P + 178, gpY + 128, { size: 16, color: accent });

  // Severity counts (right of grade).
  const scX = P + gpW + 16;
  const scW = W - P - scX;
  const chipW = (scW - 3 * 12) / 4;
  const chips = [
    { label: "CRITICAL", value: report.counts.critical, color: SEVERITY.critical },
    { label: "WARNINGS", value: report.counts.warning, color: SEVERITY.warning },
    { label: "INFO", value: report.counts.info, color: SEVERITY.info },
    { label: "GRADE", value: report.grade, color: accent },
  ];
  chips.forEach((c, i) => {
    const x = scX + i * (chipW + 12);
    glassPanel(ctx, x, gpY, chipW, 96, { radius: 16 });
    accentEdge(ctx, x + 12, gpY + 12, 5, 96 - 24, c.color);
    drawText(ctx, c.label, x + 24, gpY + 34, { size: 13, color: GLASS.label });
    drawText(ctx, String(c.value), x + 24, gpY + 76, { size: 38, color: c.color, weight: "bold" });
  });

  // Analytics strip (right, below chips).
  const m = report.metrics;
  const stats = [
    ["MEMBERS", m.members],
    ["ROLES", m.roles],
    ["ADMINS", m.privileged],
    ["THREATS", m.threatRoles + m.threatUsers + m.threatAssets],
    ["PERM RISK", m.permRisk],
    ["INTEGRITY", `${m.integrity}%`],
  ];
  const asY = gpY + 108;
  const asW = scW;
  glassPanel(ctx, scX, asY, asW, 92, { radius: 16 });
  stats.forEach(([label, value], i) => {
    const cellX = scX + 16 + i * ((asW - 32) / 6);
    drawText(ctx, label, cellX, asY + 34, { size: 12, color: GLASS.muted });
    const isThreat = (label === "THREATS" || label === "PERM RISK") && Number(value) > 0;
    drawText(ctx, String(value), cellX, asY + 70, {
      size: 28,
      color: isThreat ? GLASS.danger : GLASS.text,
      weight: "bold",
    });
  });

  // Integrity bar under the analytics.
  glassBar(ctx, P, gpY + gpH + 16, W - 2 * P, 22, report.score, accent);

  // Findings panel (left).
  const fpY = gpY + gpH + 54;
  const fpH = H - fpY - 54;
  const fpW = (W - 2 * P - 16) * 0.58;
  glassPanel(ctx, P, fpY, fpW, fpH, { radius: 20 });
  drawText(ctx, "TOP FINDINGS", P + 24, fpY + 34, { size: 16, color: GLASS.accentSoft, weight: "bold" });
  const font = `17px sans-serif`;
  const shown = report.findings.slice(0, 6);
  if (shown.length === 0) {
    drawText(ctx, "✓ No security issues detected.", P + 24, fpY + 74, { size: 17, color: GLASS.good });
  }
  shown.forEach((f, i) => {
    const y = fpY + 70 + i * 34;
    ctx.beginPath();
    ctx.arc(P + 30, y - 5, 5, 0, Math.PI * 2);
    ctx.fillStyle = SEVERITY[f.severity];
    ctx.fill();
    drawText(ctx, ellipsize(ctx, f.title, fpW - 70, font), P + 46, y, { size: 17, color: GLASS.text });
  });

  // Recommendations panel (right).
  const rpX = P + fpW + 16;
  const rpW = W - P - rpX;
  glassPanel(ctx, rpX, fpY, rpW, fpH, { radius: 20 });
  drawText(ctx, "RECOMMENDED SETTINGS", rpX + 22, fpY + 34, { size: 16, color: GLASS.accentSoft, weight: "bold" });
  const rfont = `15px sans-serif`;
  report.recommendations.slice(0, 6).forEach((r, i) => {
    const y = fpY + 70 + i * 34;
    drawText(ctx, "›", rpX + 22, y, { size: 18, color: accent, weight: "bold" });
    drawText(ctx, ellipsize(ctx, r.label, rpW - 50, rfont), rpX + 40, y, { size: 15, color: GLASS.label });
  });

  // Footer credit.
  drawText(ctx, "Developed by hrxshxforpresident", W / 2, H - 20, {
    size: 15,
    color: GLASS.muted,
    align: "center",
  });

  return canvas.toBuffer("image/png");
}
