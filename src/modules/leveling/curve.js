// XP to advance from level L to L+1 (MEE6-style).
function cost(level) {
  return 5 * level * level + 50 * level + 100;
}

// Cumulative XP required to *reach* `level`. xpForLevel(0) === 0.
export function xpForLevel(level) {
  let total = 0;
  for (let l = 0; l < level; l++) total += cost(l);
  return total;
}

// Highest level whose threshold is <= xp.
export function levelForXp(xp) {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function progress(xp) {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const xpForNext = cost(level);
  const xpIntoLevel = xp - base;
  return { level, xpIntoLevel, xpForNext, percent: xpIntoLevel / xpForNext };
}
