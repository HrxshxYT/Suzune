import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fontPath = join(dirname(fileURLToPath(import.meta.url)), "assets", "DejaVuSans.ttf");
try {
  GlobalFonts.registerFromPath(fontPath, "RankSans");
} catch {
  // Missing/invalid font file: fall back to the canvas library's built-in default font
  // rather than throwing at module import time.
}

const W = 900;
const H = 260;

export async function buildRankCard({ username, avatarPng, level, rank, xpIntoLevel, xpForNext, percent }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#1f2724";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(0, 0, 10, H);

  // Avatar (optional)
  if (avatarPng) {
    try {
      const img = await loadImage(avatarPng);
      ctx.save();
      ctx.beginPath();
      ctx.arc(140, 130, 90, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 50, 40, 180, 180);
      ctx.restore();
    } catch {
      // ignore avatar failures; card still renders
    }
  }

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "42px RankSans";
  ctx.fillText(username, 270, 90);

  ctx.font = "28px RankSans";
  ctx.fillStyle = "#9fb3ab";
  ctx.fillText(`Rank #${rank}`, 270, 135);
  ctx.fillText(`Level ${level}`, 430, 135);

  // Progress bar
  const barX = 270, barY = 170, barW = 580, barH = 40;
  ctx.fillStyle = "#2b352f";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(barX, barY, Math.max(0, Math.min(1, percent)) * barW, barH);

  ctx.fillStyle = "#ffffff";
  ctx.font = "24px RankSans";
  ctx.fillText(`${xpIntoLevel} / ${xpForNext} XP`, barX + 10, barY + 28);

  return canvas.toBuffer("image/png");
}
