import { createCanvas } from "@napi-rs/canvas";
import {
  GLASS,
  paintBackground,
  glassPanel,
  accentEdge,
  drawText,
  roundRectPath,
  FONT,
} from "../../lib/glassCard.js";

const W = 1000;
const P = 28;

function formatCount(n) {
  return Number(n ?? 0).toLocaleString("en-US");
}

// Ping quality colour on the purple palette (violet = great).
function pingColor(ping) {
  if (ping < 0) return GLASS.muted;
  if (ping <= 150) return GLASS.good;
  if (ping <= 300) return GLASS.warn;
  return GLASS.danger;
}

// Lays out the command pills into rows that fit the given inner width.
function layoutPills(ctx, names, innerWidth, size = 16) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  const padX = 14;
  const gap = 10;
  const rowH = 38;
  const rows = [];
  let row = [];
  let x = 0;
  for (const name of names) {
    const label = `/${name}`;
    const w = Math.ceil(ctx.measureText(label).width) + padX * 2;
    if (x + w > innerWidth && row.length) {
      rows.push(row);
      row = [];
      x = 0;
    }
    row.push({ label, w });
    x += w + gap;
  }
  if (row.length) rows.push(row);
  ctx.restore();
  return { rows, rowH, gap, padX };
}

// Renders the startup status report as a purple liquid-glass PNG: a header,
// four headline stats, and every online command as a pill.
export function buildStatusCard({ ping, commandCount, commandNames = [], guildCount, totalMembers }) {
  // First measure the command pills to size the canvas.
  const measure = createCanvas(10, 10).getContext("2d");
  const innerW = W - 2 * P - 48;
  const { rows, rowH, gap, padX } = layoutPills(measure, commandNames, innerW);

  const headerH = 96;
  const statsH = 120;
  const cmdHeaderH = 52;
  const cmdBodyH = Math.max(rowH, rows.length * (rowH + 8)) + 8;
  const cmdPanelH = cmdHeaderH + cmdBodyH + 20;
  const H = headerH + statsH + 24 + cmdPanelH + 60;

  const accent = GLASS.accent;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  paintBackground(ctx, W, H, accent);

  // Header.
  drawText(ctx, "● SYSTEM ONLINE", P + 14, 52, { size: 32, color: GLASS.text, weight: "bold" });
  drawText(ctx, "All systems operational — standing guard.", P + 16, 82, {
    size: 16,
    color: GLASS.label,
  });

  // Headline stat tiles.
  const gap4 = 16;
  const colW = (W - 2 * P - 3 * gap4) / 4;
  const tileH = 104;
  const tileY = headerH;
  const tiles = [
    { label: "SERVERS", value: formatCount(guildCount), color: GLASS.text },
    { label: "START PING", value: ping >= 0 ? `${Math.round(ping)}ms` : "…", color: pingColor(ping) },
    { label: "COMMANDS", value: formatCount(commandCount), color: GLASS.text },
    { label: "MEMBERS GUARDED", value: formatCount(totalMembers), color: GLASS.good },
  ];
  tiles.forEach((t, i) => {
    const x = P + i * (colW + gap4);
    glassPanel(ctx, x, tileY, colW, tileH, { radius: 18 });
    accentEdge(ctx, x + 12, tileY + 12, 5, tileH - 24, accent);
    drawText(ctx, t.label, x + 24, tileY + 36, { size: 13, color: GLASS.label });
    drawText(ctx, String(t.value), x + 24, tileY + 82, { size: 38, color: t.color, weight: "bold" });
  });

  // Commands panel.
  const cpY = headerH + statsH + 24;
  const cpH = cmdPanelH;
  glassPanel(ctx, P, cpY, W - 2 * P, cpH, { radius: 20 });
  accentEdge(ctx, P + 14, cpY + 16, 5, cpH - 32, accent);
  drawText(ctx, `ONLINE COMMANDS (${commandCount})`, P + 28, cpY + 38, {
    size: 18,
    color: GLASS.accentSoft,
    weight: "bold",
  });

  const startX = P + 24;
  let py = cpY + cmdHeaderH + 20;
  ctx.font = `16px ${FONT}`;
  for (const row of rows) {
    let px = startX;
    for (const pill of row) {
      roundRectPath(ctx, px, py - rowH + 8, pill.w, rowH - 8, (rowH - 8) / 2);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fill();
      ctx.strokeStyle = GLASS.panelBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      drawText(ctx, pill.label, px + padX, py - 8, { size: 16, color: GLASS.accentSoft });
      px += pill.w + gap;
    }
    py += rowH + 8;
  }

  // Footer credit.
  drawText(ctx, "Developed by hrxshxforpresident", W / 2, H - 22, {
    size: 15,
    color: GLASS.muted,
    align: "center",
  });

  return canvas.toBuffer("image/png");
}
