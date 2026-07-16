import { createCanvas } from "@napi-rs/canvas";
import {
  GLASS,
  hexToRgba,
  paintBackground,
  glassPanel,
  accentEdge,
  drawText,
  roundRectPath,
} from "../../lib/glassCard.js";

const W = 760;
const H = 300;

export function formatUptime(ms) {
  if (!ms || ms < 0) return "0m";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (d || h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

// Maps samples to canvas points; higher latency = nearer the top (smaller y).
export function sparklinePoints(samples, { width, height, min, max }) {
  if (!samples.length) return [];
  const lo = min ?? Math.min(...samples);
  const hi = max ?? Math.max(...samples);
  const range = hi - lo || 1;
  const n = samples.length;
  return samples.map((v, i) => ({
    x: n === 1 ? 0 : (i / (n - 1)) * width,
    y: height - ((v - lo) / range) * height,
  }));
}

// Latency health colour, kept on the purple palette (violet = great).
function pingColor(ping) {
  if (ping < 0) return GLASS.muted;
  if (ping <= 150) return GLASS.accent;
  if (ping <= 300) return GLASS.warn;
  return GLASS.danger;
}

function pingLabel(ping) {
  if (ping < 0) return "OFFLINE";
  if (ping <= 150) return "EXCELLENT";
  if (ping <= 300) return "FAIR";
  return "DEGRADED";
}

export async function buildPingCard({ samples, currentPing, uptimeMs }) {
  const accent = pingColor(currentPing);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  paintBackground(ctx, W, H, accent);

  drawText(ctx, "BOT HEALTH", 40, 52, { size: 24, color: GLASS.label, weight: "bold" });

  // Latency panel (left).
  const lpW = 300;
  glassPanel(ctx, 32, 70, lpW, H - 102, { radius: 20 });
  accentEdge(ctx, 46, 88, 5, H - 138, accent);
  drawText(ctx, "GATEWAY LATENCY", 62, 108, { size: 14, color: GLASS.label });
  drawText(ctx, currentPing < 0 ? "—" : `${currentPing}ms`, 60, 178, {
    size: 62,
    color: accent,
    weight: "bold",
  });
  drawText(ctx, pingLabel(currentPing), 62, 214, { size: 16, color: GLASS.accentSoft });
  drawText(ctx, `Uptime: ${formatUptime(uptimeMs)}`, 62, 244, { size: 16, color: GLASS.muted });

  // Sparkline panel (right).
  const spX = 352;
  const spW = W - spX - 32;
  glassPanel(ctx, spX, 70, spW, H - 102, { radius: 20 });
  drawText(ctx, "LATENCY TREND", spX + 22, 108, { size: 14, color: GLASS.label });

  const gx = spX + 22;
  const gy = 132;
  const gw = spW - 44;
  const gh = H - 200;
  if (samples.length >= 2) {
    const pts = sparklinePoints(samples, { width: gw, height: gh });
    // Soft area fill under the line.
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = gx + p.x;
      const y = gy + p.y;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(gx + gw, gy + gh);
    ctx.lineTo(gx, gy + gh);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
    grad.addColorStop(0, hexToRgba(accent, 0.4));
    grad.addColorStop(1, hexToRgba(accent, 0));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = gx + p.x;
      const y = gy + p.y;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Highlight the latest point.
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(gx + last.x, gy + last.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = GLASS.text;
    ctx.fill();
  } else {
    roundRectPath(ctx, gx, gy + gh / 2 - 14, gw, 28, 14);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    drawText(ctx, "collecting latency data…", gx + gw / 2, gy + gh / 2 + 5, {
      size: 16,
      color: GLASS.muted,
      align: "center",
    });
  }

  drawText(ctx, "Developed by hrxshxforpresident", W / 2, H - 16, {
    size: 14,
    color: GLASS.muted,
    align: "center",
  });

  return canvas.toBuffer("image/png");
}
