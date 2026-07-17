// Human-readable track durations and a text progress bar for the Now-Playing embed.

export function formatDuration(ms, { live = false } = {}) {
  if (live) return "🔴 LIVE";
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// `1:23 ━━━●───── 3:32` — a filled track, a knob at the current position, and a rail.
export function progressBar(positionMs, durationMs, width = 12, { live = false } = {}) {
  if (live || !durationMs || durationMs <= 0) {
    return `🔴 LIVE ${"━".repeat(width)}`;
  }
  const ratio = Math.max(0, Math.min(1, positionMs / durationMs));
  const knob = Math.min(width - 1, Math.floor(ratio * width));
  const bar = "━".repeat(knob) + "●" + "─".repeat(width - 1 - knob);
  return `${formatDuration(positionMs)} ${bar} ${formatDuration(durationMs)}`;
}
