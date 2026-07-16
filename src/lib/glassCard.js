import { ensureCardFont } from "./cardFont.js";

export const FONT = ensureCardFont();

// A purple "liquid glass" palette (iOS-26 flavoured): deep violet backdrop,
// frosted translucent panels with a specular top edge, soft shadows, no neon.
export const GLASS = {
  bgTop: "#241546",
  bgBot: "#120a26",
  blobPink: "rgba(236,72,153,0.30)",
  blobIndigo: "rgba(99,102,241,0.40)",
  panelFill: "rgba(255,255,255,0.06)",
  panelBorder: "rgba(196,181,253,0.22)",
  panelHi: "rgba(255,255,255,0.40)",
  accent: "#a78bfa",
  accentSoft: "#c4b5fd",
  text: "#f4efff",
  label: "#c3b3e6",
  muted: "#9b8bc4",
  good: "#7ee0b8",
  warn: "#fbbf24",
  danger: "#fb7185",
};

// Security-posture accent: brand violet when healthy, warming through amber and
// orange to rose as risk rises. Lets any report read as an index at a glance.
export function tierAccent(label) {
  switch (label) {
    case "PROTECTED":
      return GLASS.accent;
    case "GUARDED":
      return GLASS.warn;
    case "ELEVATED":
      return "#fb923c";
    default:
      return GLASS.danger;
  }
}

export function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h,
    16,
  );
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function blob(ctx, cx, cy, r, color) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

// Deep-purple gradient with soft coloured blobs the frosted panels sit over —
// the "something to refract" that sells the liquid-glass look.
export function paintBackground(ctx, W, H, accent = GLASS.accent) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, GLASS.bgTop);
  g.addColorStop(1, GLASS.bgBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  blob(ctx, W * 0.16, H * 0.08, W * 0.34, hexToRgba(accent, 0.5));
  blob(ctx, W * 0.88, H * 0.18, W * 0.38, GLASS.blobPink);
  blob(ctx, W * 0.72, H * 0.94, W * 0.42, GLASS.blobIndigo);
  blob(ctx, W * 0.08, H * 0.9, W * 0.3, hexToRgba(accent, 0.38));
}

// A frosted glass panel: soft drop shadow, a top-to-bottom sheen, a hairline
// border, and a bright specular line along the top edge.
export function glassPanel(ctx, x, y, w, h, opts = {}) {
  const {
    radius = 20,
    fill = GLASS.panelFill,
    border = GLASS.panelBorder,
    highlight = true,
    shadow = true,
  } = opts;

  ctx.save();
  if (shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
  }
  roundRectPath(ctx, x, y, w, h, radius);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.12)");
  g.addColorStop(0.5, fill);
  g.addColorStop(1, "rgba(255,255,255,0.02)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  roundRectPath(ctx, x, y, w, h, radius);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (highlight) {
    ctx.save();
    roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, radius - 1);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(x + radius, y + 1.2);
    ctx.lineTo(x + w - radius, y + 1.2);
    ctx.strokeStyle = GLASS.panelHi;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

// A soft rounded accent chip, e.g. a tile's left edge marker.
export function accentEdge(ctx, x, y, w, h, color, radius = 3) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function drawText(ctx, str, x, y, opts = {}) {
  const { size, color, weight = "", align = "left", maxWidth } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`.trim();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if (maxWidth) ctx.fillText(str, x, y, maxWidth);
  else ctx.fillText(str, x, y);
  ctx.restore();
}

// A filled rounded progress track + fill, styled as glass.
export function glassBar(ctx, x, y, w, h, pct, color) {
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const fillW = Math.max(h, (Math.max(0, Math.min(100, pct)) / 100) * w);
  const g = ctx.createLinearGradient(x, y, x + fillW, y);
  g.addColorStop(0, hexToRgba(color, 0.75));
  g.addColorStop(1, color);
  roundRectPath(ctx, x, y, fillW, h, h / 2);
  ctx.fillStyle = g;
  ctx.fill();
  // inner top sheen on the fill
  ctx.save();
  roundRectPath(ctx, x, y, fillW, h, h / 2);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x + h / 2, y + 1.5);
  ctx.lineTo(x + fillW - h / 2, y + 1.5);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
