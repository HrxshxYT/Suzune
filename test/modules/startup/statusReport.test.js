import { describe, it, expect, vi } from "vitest";
import {
  buildStartupMessage,
  collectStatus,
  collectTopServers,
  collectRecentServers,
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
  it("gathers ping, sorted commands, guilds, guarded members, and top servers", async () => {
    const { ctx } = baseCtx();
    const status = await collectStatus(ctx);
    expect(status).toMatchObject({
      ping: 42,
      commandCount: 3,
      commandNames: ["antinuke", "ban", "help"],
      guildCount: 2,
      totalMembers: 250,
    });
    // Top servers ranked by member count (g2 150 > g1 100), owners/icons resolved
    // to safe fallbacks for the minimal guild mocks.
    expect(status.topServers).toEqual([
      { name: "Unknown server", memberCount: 150, ownerName: "Unknown", iconPng: null },
      { name: "Unknown server", memberCount: 100, ownerName: "Unknown", iconPng: null },
    ]);
    // Recent servers present with safe fallbacks (no join timestamps on the mocks).
    expect(status.recentServers).toEqual([
      { name: "Unknown server", ownerName: "Unknown", joinedTimestamp: null },
      { name: "Unknown server", ownerName: "Unknown", joinedTimestamp: null },
    ]);
  });
});

describe("collectRecentServers", () => {
  function joinedGuild(id, name, joinedTimestamp, ownerId) {
    return { id, name, joinedTimestamp, ownerId, memberCount: 1 };
  }

  it("ranks by join time (newest first) and resolves owner names", async () => {
    const client = {
      shard: null,
      guilds: {
        cache: new Map([
          ["g1", joinedGuild("g1", "Oldest", 1000, "o1")],
          ["g2", joinedGuild("g2", "Newest", 3000, "o2")],
          ["g3", joinedGuild("g3", "Middle", 2000, null)],
        ]),
      },
      users: {
        fetch: vi.fn(async (id) => ({ username: id === "o2" ? "zoe" : "amy", globalName: null })),
      },
    };

    const recent = await collectRecentServers(client, 3);
    expect(recent.map((s) => s.name)).toEqual(["Newest", "Middle", "Oldest"]);
    expect(recent[0]).toEqual({ name: "Newest", ownerName: "zoe", joinedTimestamp: 3000 });
    expect(recent[2].ownerName).toBe("amy");
  });

  it("respects the limit", async () => {
    const cache = new Map();
    for (let i = 0; i < 6; i++) cache.set(`g${i}`, joinedGuild(`g${i}`, `S${i}`, i * 100, null));
    const client = { shard: null, guilds: { cache }, users: { fetch: vi.fn() } };
    const recent = await collectRecentServers(client, 3);
    // Newest joins first: g5 (500), g4 (400), g3 (300).
    expect(recent.map((s) => s.name)).toEqual(["S5", "S4", "S3"]);
  });
});

describe("collectTopServers", () => {
  function richGuild(id, name, memberCount, ownerId) {
    return {
      id,
      name,
      memberCount,
      ownerId,
      iconURL: vi.fn(() => `https://cdn/${id}.png`),
    };
  }

  it("ranks by member count, resolves owner names, and fetches icon bytes", async () => {
    const usersById = {
      o1: { username: "alice", globalName: "Alice" },
      o2: { username: "bob", globalName: null },
    };
    const client = {
      shard: null,
      guilds: {
        cache: new Map([
          ["g1", richGuild("g1", "Small", 50, "o1")],
          ["g2", richGuild("g2", "Big", 900, "o2")],
        ]),
      },
      users: { fetch: vi.fn(async (id) => usersById[id]) },
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });

    const top = await collectTopServers(client, 5);

    expect(top.map((s) => s.name)).toEqual(["Big", "Small"]);
    // g2's owner has no globalName, so it falls back to the username.
    expect(top[0]).toMatchObject({ ownerName: "bob", memberCount: 900 });
    expect(top[1]).toMatchObject({ ownerName: "Alice", memberCount: 50 });
    expect(Buffer.isBuffer(top[0].iconPng)).toBe(true);
    fetchSpy.mockRestore();
  });

  it("degrades to safe fallbacks when owner fetch and icon fetch fail", async () => {
    const client = {
      shard: null,
      guilds: { cache: new Map([["g1", richGuild("g1", "Solo", 5, "o1")]]) },
      users: {
        fetch: vi.fn(async () => {
          throw new Error("unknown user");
        }),
      },
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false });

    const [server] = await collectTopServers(client, 5);

    expect(server).toEqual({ name: "Solo", memberCount: 5, ownerName: "Unknown", iconPng: null });
    fetchSpy.mockRestore();
  });

  it("respects the limit", async () => {
    const cache = new Map();
    for (let i = 0; i < 8; i++) cache.set(`g${i}`, richGuild(`g${i}`, `S${i}`, i * 10, null));
    const client = { shard: null, guilds: { cache }, users: { fetch: vi.fn() } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false });

    const top = await collectTopServers(client, 3);
    expect(top).toHaveLength(3);
    // Highest member counts first: g7 (70), g6 (60), g5 (50).
    expect(top.map((s) => s.name)).toEqual(["S7", "S6", "S5"]);
    vi.restoreAllMocks();
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

  it("builds a titled embed with the card image and credited footer", async () => {
    const { embeds } = await buildStartupMessage(status);
    const embed = embeds[0];
    expect(embed.data.title).toContain("Online");
    expect(embed.data.image.url).toBe("attachment://status.png");
    expect(embed.data.footer.text).toBe("Developed by hrxshxforpresident");
    expect(embed.data.timestamp).toBeTruthy();
    expect(embed.data.description ?? "").toBe("");
    // No recent servers on this status → no field is added.
    expect(embed.data.fields ?? []).toHaveLength(0);
  });

  it("adds a Recently Added Servers field with relative join times", async () => {
    const { embeds } = await buildStartupMessage({
      ...status,
      recentServers: [
        { name: "Fresh Guild", ownerName: "Alice", joinedTimestamp: 1_700_000_000_000 },
        { name: "No Time Guild", ownerName: "bob", joinedTimestamp: null },
      ],
    });
    const field = embeds[0].data.fields[0];
    expect(field.name).toContain("Recently Added Servers");
    expect(field.value).toContain("**1.** Fresh Guild · owner Alice · joined <t:1700000000:R>");
    // A guild with no join timestamp still lists, just without the "joined" clause.
    expect(field.value).toContain("**2.** No Time Guild · owner bob");
    expect(field.value).not.toContain("**2.** No Time Guild · owner bob · joined");
  });

  it("attaches the analytics card as a PNG", async () => {
    const { files } = await buildStartupMessage(status);
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
