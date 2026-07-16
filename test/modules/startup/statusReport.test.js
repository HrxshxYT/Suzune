import { describe, it, expect, vi } from "vitest";
import {
  buildStartupMessage,
  collectStatus,
  countGuilds,
  countMembers,
  sendStartupReport,
  STARTUP_DM_USER_ID,
} from "../../../src/modules/startup/statusReport.js";

const commands = new Map([
  ["ban", {}],
  ["antinuke", {}],
  ["help", {}],
]);

function guildCache() {
  return new Map([
    ["g1", { memberCount: 100 }],
    ["g2", { memberCount: 150 }],
  ]);
}

function baseCtx(overrides = {}) {
  const send = vi.fn(async () => {});
  const client = {
    ws: { ping: 42 },
    shard: null,
    guilds: { cache: guildCache() },
    users: { fetch: vi.fn(async () => ({ send })) },
    ...overrides.client,
  };
  return {
    ctx: {
      client,
      commands,
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

describe("countMembers", () => {
  it("sums guild member counts locally when not sharded", async () => {
    expect(await countMembers({ shard: null, guilds: { cache: guildCache() } })).toBe(250);
  });

  it("sums broadcastEval results across shards", async () => {
    const client = {
      shard: { broadcastEval: vi.fn(async () => [1000, 2500]) },
      guilds: { cache: guildCache() },
    };
    expect(await countMembers(client)).toBe(3500);
  });

  it("falls back to the local sum if broadcastEval fails", async () => {
    const client = {
      shard: {
        broadcastEval: vi.fn(async () => {
          throw new Error("shard not ready");
        }),
      },
      guilds: { cache: guildCache() },
    };
    expect(await countMembers(client)).toBe(250);
  });
});

describe("collectStatus", () => {
  it("gathers ping, sorted commands, guilds, and guarded members", async () => {
    const { ctx } = baseCtx();
    const status = await collectStatus(ctx);
    expect(status).toEqual({
      ping: 42,
      commandCount: 3,
      commandNames: ["antinuke", "ban", "help"],
      guildCount: 2,
      totalMembers: 250,
    });
  });
});

describe("buildStartupMessage", () => {
  const status = {
    ping: 42,
    commandCount: 3,
    commandNames: ["antinuke", "ban", "help"],
    guildCount: 2,
    totalMembers: 250,
  };

  it("builds a clean embed with only a title, image and credited footer", () => {
    const { embeds } = buildStartupMessage(status);
    const embed = embeds[0];
    expect(embed.data.title).toContain("Online");
    expect(embed.data.image.url).toBe("attachment://status.png");
    expect(embed.data.footer.text).toBe("Developed by hrxshxforpresident");
    expect(embed.data.timestamp).toBeTruthy();
    // "nothing else" — no descriptive fields on the embed.
    expect(embed.data.fields ?? []).toHaveLength(0);
    expect(embed.data.description ?? "").toBe("");
  });

  it("attaches the analytics card as a PNG", () => {
    const { files } = buildStartupMessage(status);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("status.png");
    expect(files[0].attachment.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});

describe("sendStartupReport", () => {
  it("DMs the configured user with an embed and image", async () => {
    const { ctx, send } = baseCtx();
    const res = await sendStartupReport(ctx);
    expect(res.sent).toBe(true);
    expect(ctx.client.users.fetch).toHaveBeenCalledWith(STARTUP_DM_USER_ID);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array), files: expect.any(Array) }),
    );
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
