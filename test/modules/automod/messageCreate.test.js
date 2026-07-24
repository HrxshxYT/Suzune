import { describe, it, expect, vi } from "vitest";
import handler from "../../../src/modules/automod/events/messageCreate.js";
import { HeatService } from "../../../src/core/HeatService.js";
import { RuleCache } from "../../../src/modules/automod/rules/cache.js";
import { FeedLoader } from "../../../src/modules/automod/feed/loader.js";

function ctxFor(packStates, rules = [], automodOverrides = {}) {
  return {
    config: {
      getGuild: vi.fn(async () => ({ automod: { enabled: true, heatThreshold: 50, heatDecaySec: 60, thresholdAction: "timeout", timeoutSeconds: 300, exemptRoles: [], exemptChannels: [], ...automodOverrides }, dmOnAction: false })),
      getPackStates: vi.fn(async () => packStates),
      getAutomodRules: vi.fn(async () => rules),
      addAutomodLog: vi.fn(),
      disableAutomodRule: vi.fn(),
    },
    heat: new HeatService(() => 0),
    automodFeed: new FeedLoader({ feedUrl: null, logger: { warn() {}, info() {} } }),
    automodRules: new RuleCache({ warn() {} }),
    cases: { createCase: vi.fn() },
    logger: { error() {}, warn() {} },
  };
}

const scamMessage = () => ({
  guild: { id: "g", name: "S" }, author: { id: "u", bot: false }, channelId: "c",
  member: { id: "u", displayName: "u", roles: { cache: new Map() }, permissions: { has: () => false }, timeout: vi.fn().mockResolvedValue(), user: { id: "u" } },
  content: "free nitro discord.gift/abc", embeds: [], attachments: new Map(), stickers: new Map(),
  client: { user: { id: "bot" } }, delete: vi.fn().mockResolvedValue(),
});

describe("automod messageCreate", () => {
  it("ignores bots", async () => {
    const ctx = ctxFor([]);
    await handler.execute(ctx, { ...scamMessage(), author: { id: "u", bot: true } });
    expect(ctx.config.getGuild).not.toHaveBeenCalled();
  });
  it("deletes a scam message when the nitro pack is enabled", async () => {
    const ctx = ctxFor([{ packId: "nitro", enabled: true, installedVersion: 1 }, { packId: "core", enabled: true, installedVersion: 1 }]);
    const msg = scamMessage();
    await handler.execute(ctx, msg);
    expect(msg.delete).toHaveBeenCalled();
  });
  it("skips exempt members", async () => {
    const ctx = ctxFor([{ packId: "nitro", enabled: true, installedVersion: 1 }]);
    const msg = scamMessage();
    msg.member.permissions.has = () => true; // Manage Messages
    await handler.execute(ctx, msg);
    expect(msg.delete).not.toHaveBeenCalled();
  });
  it("logs 'flagged' (not 'delete') for a deleteOnHit:false hit that doesn't cross the heat threshold", async () => {
    // crypto pack's "air drop" rule: weight 35, deleteOnHit:false. With a heat
    // threshold of 1000 the hit neither deletes the message nor punishes the
    // member, so the audit log should record "flagged", not "delete".
    const ctx = ctxFor(
      [{ packId: "crypto", enabled: true, installedVersion: 1 }],
      [],
      { heatThreshold: 1000 },
    );
    const msg = { ...scamMessage(), content: "air drop" };
    await handler.execute(ctx, msg);
    expect(msg.delete).not.toHaveBeenCalled();
    expect(msg.member.timeout).not.toHaveBeenCalled();
    expect(ctx.config.addAutomodLog).toHaveBeenCalledWith(
      "g",
      expect.objectContaining({ action: "flagged", dryRun: false }),
    );
  });
});
