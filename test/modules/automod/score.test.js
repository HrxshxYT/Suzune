import { describe, it, expect } from "vitest";
import { score } from "../../../src/modules/automod/pipeline/score.js";
import { HeatService } from "../../../src/core/HeatService.js";

describe("score", () => {
  it("adds weighted heat for live hits and flags delete", () => {
    const heat = new HeatService(() => 0);
    const r = score({
      hits: [{ source: "nitro", weight: 60, deleteOnHit: true, dryRun: false }],
      guildId: "g", userId: "u", heat, halfLifeMs: 60000,
    });
    expect(r.heatAfter).toBe(60);
    expect(r.deleteMessage).toBe(true);
    expect(r.liveHits).toHaveLength(1);
  });
  it("dry-run hits add no heat and never delete", () => {
    const heat = new HeatService(() => 0);
    const r = score({
      hits: [{ source: "test", weight: 99, deleteOnHit: true, dryRun: true }],
      guildId: "g", userId: "u", heat, halfLifeMs: 60000,
    });
    expect(r.heatAfter).toBe(0);
    expect(r.deleteMessage).toBe(false);
    expect(r.dryRunHits).toHaveLength(1);
    expect(r.liveHits).toHaveLength(0);
  });

  it("a mixed batch only counts the live hit's weight toward heat and delete", () => {
    const heat = new HeatService(() => 0);
    const dryHit = { source: "dry", weight: 99, deleteOnHit: true, dryRun: true };
    const liveHit = { source: "live", weight: 40, deleteOnHit: true, dryRun: false };
    const r = score({
      hits: [dryHit, liveHit],
      guildId: "g", userId: "u", heat, halfLifeMs: 60000,
    });
    expect(r.heatAfter).toBe(40); // only the live hit's weight, not 99 + 40
    expect(r.deleteMessage).toBe(true); // driven only by the live hit
    expect(r.dryRunHits).toEqual([dryHit]);
    expect(r.liveHits).toEqual([liveHit]);
  });
});
