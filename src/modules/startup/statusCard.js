import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  GLASS,
  paintBackground,
  glassPanel,
  accentEdge,
  drawText,
  ellipsize,
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

// Draws a server's icon as a rounded square. Falls back to a glass tile with the
// server's initial when no icon is set or the image fails to decode.
async function drawServerIcon(ctx, server, x, y, size) {
  const radius = 14;
  let drawn = false;
  if (server.iconPng) {
    try {
      const img = await loadImage(server.iconPng);
      ctx.save();
      roundRectPath(ctx, x, y, size, size, radius);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
      drawn = true;
    } catch {
      // fall through to the lettered placeholder
    }
  }
  if (!drawn) {
    roundRectPath(ctx, x, y, size, size, radius);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    const initial = (server.name?.trim()?.[0] ?? "?").toUpperCase();
    drawText(ctx, initial, x + size / 2, y + size / 2 + 8, {
      size: 22,
      color: GLASS.accentSoft,
      weight: "bold",
      align: "center",
    });
  }
  // Subtle glass border around the icon.
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.strokeStyle = GLASS.panelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
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
// four headline stats, the top servers the bot is in, and every online command
// as a pill.
export async function buildStatusCard({
  ping,
  commandCount,
  commandNames = [],
  guildCount,
  totalMembers,
  topServers = [],
}) {
  // First measure the command pills to size the canvas.
  const measure = createCanvas(10, 10).getContext("2d");
  const innerW = W - 2 * P - 48;
  const { rows, rowH, gap, padX } = layoutPills(measure, commandNames, innerW);

  const headerH = 96;
  const statsH = 120;

  // Top-servers panel geometry.
  const svHeaderH = 52;
  const svRowH = 68;
  const svRowCount = Math.max(topServers.length, 1);
  const svBodyH = svRowCount * svRowH + 12;
  const svPanelH = svHeaderH + svBodyH + 16;

  const cmdHeaderH = 52;
  const cmdBodyH = Math.max(rowH, rows.length * (rowH + 8)) + 8;
  const cmdPanelH = cmdHeaderH + cmdBodyH + 20;

  const svY = headerH + statsH + 24;
  const cpY = svY + svPanelH + 24;
  const H = cpY + cmdPanelH + 60;

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

  // Top-servers panel.
  glassPanel(ctx, P, svY, W - 2 * P, svPanelH, { radius: 20 });
  accentEdge(ctx, P + 14, svY + 16, 5, svPanelH - 32, accent);
  drawText(ctx, `TOP SERVERS (${topServers.length})`, P + 28, svY + 38, {
    size: 18,
    color: GLASS.accentSoft,
    weight: "bold",
  });

  const svRowsY = svY + svHeaderH + 8;
  if (topServers.length === 0) {
    drawText(ctx, "Not in any servers yet.", W / 2, svRowsY + 34, {
      size: 16,
      color: GLASS.muted,
      align: "center",
    });
  } else {
    const iconSize = 46;
    const iconX = P + 28;
    const textX = iconX + iconSize + 18;
    const rankX = W - P - 24;
    const nameMaxW = rankX - textX - 24;
    for (let i = 0; i < topServers.length; i++) {
      const s = topServers[i];
      const rowTop = svRowsY + i * svRowH;
      const iconY = rowTop + (svRowH - iconSize) / 2 - 4;
      await drawServerIcon(ctx, s, iconX, iconY, iconSize);
      drawText(ctx, ellipsize(ctx, s.name ?? "Unknown server", nameMaxW, 22, "bold"), textX, rowTop + 26, {
        size: 22,
        color: GLASS.text,
        weight: "bold",
      });
      const sub = `Owner: ${s.ownerName ?? "Unknown"}  ·  ${formatCount(s.memberCount)} members`;
      drawText(ctx, ellipsize(ctx, sub, nameMaxW, 15), textX, rowTop + 50, {
        size: 15,
        color: GLASS.label,
      });
      drawText(ctx, `#${i + 1}`, rankX, rowTop + 38, {
        size: 22,
        color: GLASS.accentSoft,
        weight: "bold",
        align: "right",
      });
    }
  }

  // Commands panel.
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
