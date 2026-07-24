// In-memory decaying heat accumulator, keyed per guild+user. Generic: the
// half-life is supplied per call so anti-nuke and the join gate can reuse it
// with their own decay windows (mirrors WindowTracker(windowMs)).
export class HeatService {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.map = new Map(); // "guildId:userId" -> { value, lastTs }
  }

  #decayed(entry, halfLifeMs, nowMs) {
    if (!entry) return 0;
    const dt = nowMs - entry.lastTs;
    if (dt <= 0) return entry.value;
    return entry.value * Math.pow(0.5, dt / halfLifeMs);
  }

  add(guildId, userId, amount, halfLifeMs) {
    const key = `${guildId}:${userId}`;
    const nowMs = this.now();
    const value = this.#decayed(this.map.get(key), halfLifeMs, nowMs) + amount;
    this.map.set(key, { value, lastTs: nowMs });
    return value;
  }

  get(guildId, userId, halfLifeMs) {
    return this.#decayed(this.map.get(`${guildId}:${userId}`), halfLifeMs, this.now());
  }

  reset(guildId, userId) {
    this.map.delete(`${guildId}:${userId}`);
  }

  sweep(halfLifeMs, epsilon = 0.5) {
    const nowMs = this.now();
    for (const [key, entry] of this.map)
      if (this.#decayed(entry, halfLifeMs, nowMs) < epsilon) this.map.delete(key);
  }
}
