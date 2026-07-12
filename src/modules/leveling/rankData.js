import { progress } from "./curve.js";

export function buildRankData({ xp, rank }) {
  const p = progress(xp);
  return {
    level: p.level,
    rank,
    xp,
    xpIntoLevel: p.xpIntoLevel,
    xpForNext: p.xpForNext,
    percent: p.percent,
  };
}
