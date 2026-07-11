import { describe, it, expect, vi } from "vitest";
import {
  buildStartupEmbed,
  collectStatus,
  countGuilds,
  sendStartupReport,
  STARTUP_DM_USER_ID,
} from "../../../src/modules/startup/statusReport.js";

const commands = new Map([
  ["ban", {}],
  ["antinuke", {}],
  ["help", {}],
]);

function baseCtx(overrides = {}) {
  const send = vi.fn(async () => {});
  const client = {
    ws: { ping: 42 },
    shard: null,
    guilds: { cache: { size: 5 } },
    users: { fetch: vi.fn(async () => ({ send })) },
    ...overrides.client,
  };
  return {
    ctx: {
      client,
      commands,
      stats: { getAntinukeTriggers: vi.fn(async () => 9) },
      logger: { info: vi.fn(), error: vi.fn() },
    },
    send,
  };
}

describe("countGuilds", () => {
  it("reads the local cache when not sharded", async () => {
    expect(await countGuilds({ shard: null, guilds: { cache: { size: 3 } } })).toBe(3);
  });

  it("sums across shards when sharded", async () => {
    const client = {
      shard: { fetchClientValues: vi.fn(async () => [4, 6, 2]) },
      guilds: { cache: { size: 4 } },
    };
    expect(await countGuilds(client)).toBe(12);
  });

  it("falls back to the local cache if a shard is not ready", async () => {
    const client = {
      shard: {
        fetchClientValues: vi.fn(async () => {
          throw new Error("shard not ready");
        }),
      },
      guilds: { cache: { size: 4 } },
    };
    expect(await countGuilds(client)).toBe(4);
  });
});

describe("buildStartupEmbed", () => {
  it("includes ping, servers, triggers, and command count", () => {
    const e = buildStartupEmbed({
      ping: 42,
      commandCount: 3,
      commandNames: ["antinuke", "ban", "help"],
      guildCount: 5,
      antinukeTriggers: 9,
    });
    const json = JSON.stringify(e.data);
    expect(json).toContain("42ms");
    expect(json).toContain("Commands functional (3)");
    expect(json).toContain("/antinuke");
    expect(json).toContain('"🌐 Servers"');
    expect(json).toContain("Anti-nukes triggered");
  });

  it("shows a placeholder when ping is not measured yet", () => {
    const e = buildStartupEmbed({
      ping: -1,
      commandCount: 0,
      commandNames: [],
      guildCount: 0,
      antinukeTriggers: 0,
    });
    expect(JSON.stringify(e.data)).toContain("measuring");
  });
});

describe("collectStatus", () => {
  it("gathers ping, sorted commands, guilds, and triggers", async () => {
    const { ctx } = baseCtx();
    const status = await collectStatus(ctx);
    expect(status).toEqual({
      ping: 42,
      commandCount: 3,
      commandNames: ["antinuke", "ban", "help"],
      guildCount: 5,
      antinukeTriggers: 9,
    });
  });
});

describe("sendStartupReport", () => {
  it("DMs the configured user with an embed", async () => {
    const { ctx, send } = baseCtx();
    const res = await sendStartupReport(ctx);
    expect(res.sent).toBe(true);
    expect(ctx.client.users.fetch).toHaveBeenCalledWith(STARTUP_DM_USER_ID);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("only sends from the primary shard", async () => {
    const { ctx, send } = baseCtx({ client: { shard: { ids: [1] } } });
    const res = await sendStartupReport(ctx);
    expect(res).toEqual({ sent: false, reason: "not_primary_shard" });
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows DM failures without throwing", async () => {
    const { ctx } = baseCtx();
    ctx.client.users.fetch = vi.fn(async () => {
      throw new Error("cannot DM user");
    });
    const res = await sendStartupReport(ctx);
    expect(res.sent).toBe(false);
    expect(ctx.logger.error).toHaveBeenCalled();
  });
});
