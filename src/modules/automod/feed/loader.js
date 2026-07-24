import { SNAPSHOT } from "./snapshot.js";

// Swappable scam-domain feed. The blocklist lives in memory, seeded from the
// vendored snapshot and refreshed from `feedUrl`. A failed or disabled refresh
// leaves the current set untouched — the snapshot is always the floor.
export class FeedLoader {
  constructor({ feedUrl, logger }) {
    this.feedUrl = feedUrl || null;
    this.logger = logger;
    this.set = new Set(SNAPSHOT.map((d) => d.toLowerCase()));
  }

  getBlocklist() {
    return this.set;
  }

  parse(text) {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith("#"));
  }

  async refresh(fetchImpl = fetch) {
    if (!this.feedUrl) return { ok: true, count: this.set.size, source: "snapshot" };
    try {
      const res = await fetchImpl(this.feedUrl);
      if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
      const domains = this.parse(await res.text());
      const next = new Set(SNAPSHOT.map((d) => d.toLowerCase()));
      for (const d of domains) next.add(d);
      this.set = next;
      this.logger.info?.({ count: next.size }, "automod: scam feed refreshed");
      return { ok: true, count: next.size, source: "feed" };
    } catch (err) {
      this.logger.warn?.({ err: err.message }, "automod: scam feed refresh failed; keeping current list");
      return { ok: false, count: this.set.size, source: "stale" };
    }
  }
}
