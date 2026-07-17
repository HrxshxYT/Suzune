import { createCanvas } from "@napi-rs/canvas";
import {
  FONT,
  GLASS,
  paintBackground,
  glassPanel,
  accentEdge,
  drawText,
  ellipsize,
} from "../../lib/glassCard.js";

const W = 760;
const PAD = 32;

// Home overview: every category as a frosted tile (name + command count).
export function buildHomeCard({ botName, categories }) {
  const COLS = 2;
  const GAP = 16;
  const TILE_H = 64;
  const ROW_GAP = 14;
  const HEAD = 120;
  const FOOT = 46;

  const rows = Math.ceil(categories.length / COLS);
  const H = Math.max(HEAD + rows * (TILE_H + ROW_GAP) + FOOT, 200);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  paintBackground(ctx, W, H, GLASS.accent);
  drawText(ctx, `${botName.toUpperCase()} — COMMAND CENTER`, PAD, 58, {
    size: 30,
    color: GLASS.text,
    weight: "bold",
  });
  drawText(ctx, "All-in-one moderation, security & community", PAD, 90, {
    size: 16,
    color: GLASS.label,
  });

  const tileW = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
  categories.forEach((cat, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const x = PAD + col * (tileW + GAP);
    const y = HEAD + row * (TILE_H + ROW_GAP);
    glassPanel(ctx, x, y, tileW, TILE_H, { radius: 16 });
    accentEdge(ctx, x + 14, y + 14, 5, TILE_H - 28, GLASS.accent);
    const name = ellipsize(ctx, cat.name.toUpperCase(), tileW - 60, 20, "bold");
    drawText(ctx, name, x + 30, y + 32, { size: 20, color: GLASS.text, weight: "bold" });
    drawText(ctx, `${cat.count} command${cat.count === 1 ? "" : "s"}`, x + 30, y + 52, {
      size: 14,
      color: GLASS.muted,
    });
  });

  if (categories.length === 0) {
    drawText(ctx, "No commands available.", W / 2, HEAD + 30, {
      size: 16,
      color: GLASS.muted,
      align: "center",
    });
  }

  drawText(ctx, "Developed by hrxshxforpresident", W / 2, H - 18, {
    size: 14,
    color: GLASS.muted,
    align: "center",
  });
  return canvas.toBuffer("image/png");
}

// One category: its commands laid out as frosted `/command` pills that flow and wrap.
export function buildCategoryCard({ botName, category, commands }) {
  const CHIP_H = 44;
  const CHIP_GAP = 12;
  const CHIP_PAD_X = 18;
  const START_Y = 150;
  const maxChipW = W - PAD * 2;

  // Measure each pill so we can flow them into rows and size the canvas to fit.
  const measure = createCanvas(10, 10).getContext("2d");
  measure.font = `bold 18px ${FONT}`;
  const chips = commands.map((name) => {
    const label = `/${name}`;
    const w = Math.min(measure.measureText(label).width + CHIP_PAD_X * 2, maxChipW);
    return { label, w };
  });

  const rows = [];
  let cur = [];
  let curW = 0;
  for (const chip of chips) {
    if (cur.length && curW + chip.w > maxChipW) {
      rows.push(cur);
      cur = [];
      curW = 0;
    }
    cur.push(chip);
    curW += chip.w + CHIP_GAP;
  }
  if (cur.length) rows.push(cur);

  const H = START_Y + Math.max(rows.length, 1) * (CHIP_H + CHIP_GAP) + 30;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  paintBackground(ctx, W, H, GLASS.accent);
  drawText(ctx, `${botName.toUpperCase()} · HELP`, PAD, 52, {
    size: 20,
    color: GLASS.label,
    weight: "bold",
  });
  drawText(ctx, ellipsize(ctx, category.toUpperCase(), maxChipW, 40, "bold"), PAD, 100, {
    size: 40,
    color: GLASS.text,
    weight: "bold",
  });
  drawText(
    ctx,
    `${commands.length} command${commands.length === 1 ? "" : "s"} — pick one below for details`,
    PAD,
    128,
    { size: 15, color: GLASS.muted },
  );

  let y = START_Y;
  for (const row of rows) {
    let x = PAD;
    for (const chip of row) {
      glassPanel(ctx, x, y, chip.w, CHIP_H, { radius: CHIP_H / 2 });
      drawText(ctx, chip.label, x + chip.w / 2, y + CHIP_H / 2 + 6, {
        size: 18,
        color: GLASS.accentSoft,
        weight: "bold",
        align: "center",
      });
      x += chip.w + CHIP_GAP;
    }
    y += CHIP_H + CHIP_GAP;
  }

  if (commands.length === 0) {
    drawText(ctx, "No commands in this category.", W / 2, START_Y + 20, {
      size: 16,
      color: GLASS.muted,
      align: "center",
    });
  }

  drawText(ctx, "Developed by hrxshxforpresident", W / 2, H - 14, {
    size: 14,
    color: GLASS.muted,
    align: "center",
  });
  return canvas.toBuffer("image/png");
}
