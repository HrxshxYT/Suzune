import { describe, it, expect, vi } from "vitest";
import { restoreDashboards } from "../../../src/modules/dashboard/live.js";

function makeCtx({ rows, ownedGuildIds, fetchable }) {
  const start = vi.fn();
  const deleteMany = vi.fn(async () => {});
  const ctx = {
    client: {
      guilds: { cache: new Map(ownedGuildIds.map((id) => [id, { id }])) },
      channels: {
        fetch: vi.fn(async (channelId) => {
          if (!fetchable.has(channelId)) throw new Error("Unknown Channel");
          return {
            guild: { id: `guild-of-${channelId}` },
            messages: {
              fetch: vi.fn(async (id) => ({ id, channelId })),
            },
          };
        }),
      },
    },
    prisma: { dashboard: { findMany: vi.fn(async () => rows), deleteMany } },
    dashboards: { start },
    logger: { info: vi.fn(), error: vi.fn() },
  };
  return { ctx, start, deleteMany };
}

describe("restoreDashboards", () => {
  it("restores loops for live messages on this shard", async () => {
    const { ctx, start } = makeCtx({
      rows: [{ id: "m1", guildId: "g1", channelId: "c1" }],
      ownedGuildIds: ["g1"],
      fetchable: new Set(["c1"]),
    });
    const restored = await restoreDashboards(ctx);
    expect(restored).toBe(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("skips (and does not delete) rows for guilds on another shard", async () => {
    const { ctx, start, deleteMany } = makeCtx({
      rows: [{ id: "m1", guildId: "other", channelId: "c1" }],
      ownedGuildIds: ["g1"],
      fetchable: new Set(["c1"]),
    });
    const restored = await restoreDashboards(ctx);
    expect(restored).toBe(0);
    expect(start).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("prunes rows whose message/channel is gone on this shard", async () => {
    const { ctx, start, deleteMany } = makeCtx({
      rows: [{ id: "m1", guildId: "g1", channelId: "missing" }],
      ownedGuildIds: ["g1"],
      fetchable: new Set(),
    });
    const restored = await restoreDashboards(ctx);
    expect(restored).toBe(0);
    expect(start).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "m1" } });
  });

  it("returns 0 and logs when the store is unavailable", async () => {
    const ctx = {
      client: { guilds: { cache: new Map() } },
      prisma: { dashboard: { findMany: vi.fn(async () => { throw new Error("db down"); }) } },
      dashboards: { start: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    expect(await restoreDashboards(ctx)).toBe(0);
    expect(ctx.logger.error).toHaveBeenCalled();
  });
});
