import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  GLASS,
  paintBackground,
  glassPanel,
  drawText,
  glassBar,
} from "../../lib/glassCard.js";

const W = 900;
const H = 300;

export async function buildRankCard({ username, avatarPng, level, rank, xpIntoLevel, xpForNext, percent }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  paintBackground(ctx, W, H, GLASS.accent);
  glassPanel(ctx, 24, 24, W - 48, H - 48, { radius: 26 });

  // Avatar with a glass ring.
  const cx = 130;
  const cy = 150;
  const r = 78;
  if (avatarPng) {
    try {
      const img = await loadImage(avatarPng);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    } catch {
      // ignore avatar failures; card still renders
    }
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = GLASS.accentSoft;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Name + stat chips.
  drawText(ctx, username, 250, 108, { size: 44, color: GLASS.text, weight: "bold", maxWidth: W - 300 });

  const chip = (x, label, value, color) => {
    const w = 150;
    const y = 128;
    glassPanel(ctx, x, y, w, 54, { radius: 14, shadow: false });
    drawText(ctx, label, x + 16, y + 22, { size: 13, color: GLASS.label });
    drawText(ctx, value, x + 16, y + 44, { size: 22, color, weight: "bold" });
    return x + w + 14;
  };
  let cx2 = 250;
  cx2 = chip(cx2, "RANK", `#${rank}`, GLASS.accentSoft);
  cx2 = chip(cx2, "LEVEL", String(level), GLASS.accentSoft);
  chip(cx2, "XP", `${xpIntoLevel}/${xpForNext}`, GLASS.good);

  // Progress bar.
  const barX = 250;
  const barY = 210;
  const barW = W - barX - 60;
  glassBar(ctx, barX, barY, barW, 30, Math.max(0, Math.min(1, percent)) * 100, GLASS.accent);
  drawText(ctx, `${Math.round(Math.max(0, Math.min(1, percent)) * 100)}%`, barX + barW, barY - 8, {
    size: 16,
    color: GLASS.label,
    align: "right",
  });

  // Footer credit.
  drawText(ctx, "Developed by hrxshxforpresident", W / 2, H - 40, {
    size: 14,
    color: GLASS.muted,
    align: "center",
  });

  return canvas.toBuffer("image/png");
}
