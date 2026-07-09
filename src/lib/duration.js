const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDuration(input) {
  if (typeof input !== "string" || input.trim() === "") return null;
  const re = /(\d+)\s*([smhdw])/gi;
  let total = 0;
  let matched = false;
  let consumed = "";
  for (const m of input.matchAll(re)) {
    matched = true;
    consumed += m[0];
    total += Number(m[1]) * UNIT_MS[m[2].toLowerCase()];
  }
  // Reject strings that contain stray non-matching characters (e.g. "10x").
  if (!matched || consumed.replace(/\s/g, "").length !== input.replace(/\s/g, "").length) {
    return null;
  }
  return total;
}

export function formatDuration(ms) {
  if (ms <= 0) return "0s";
  const order = [
    ["w", UNIT_MS.w],
    ["d", UNIT_MS.d],
    ["h", UNIT_MS.h],
    ["m", UNIT_MS.m],
    ["s", UNIT_MS.s],
  ];
  const parts = [];
  let rem = ms;
  for (const [label, size] of order) {
    const value = Math.floor(rem / size);
    if (value > 0) {
      parts.push(`${value}${label}`);
      rem -= value * size;
    }
  }
  return parts.join(" ");
}
