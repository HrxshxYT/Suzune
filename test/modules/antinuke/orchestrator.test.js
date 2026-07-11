import { describe, it, expect, vi } from "vitest";
import { AuditLogEvent } from "discord.js";
import { processAuditEntry } from "../../../src/modules/antinuke/orchestrator.js";
import { AntinukeState } from "../../../src/modules/antinuke/AntinukeState.js";

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

function baseGuild() {
  return { id: "g1", ownerId: "owner", members: { me: { id: "bot" } } };
}
function enabledConfig(overrides = {}) {
  return {
    antinuke: {
      enabled: true,
      punishment: "ban",
      autoRevert: false,
      alertChannelId: "c1",
      panicMode: false,
      thresholds: {},
      ...overrides,
    },
    whitelist: [],
  };
}
function deps() {
  return {
    fetchMember: vi.fn(async () => ({ id: "attacker", roles: { cache: new Map() } })),
    applyPunishment: vi.fn(async () => "ban"),
    revertAction: vi.fn(async () => "no_revert"),
    sendAlert: vi.fn(async () => true),
  };
}

const banEntry = (executorId = "attacker") => ({
  action: AuditLogEvent.MemberBanAdd,
  executorId,
  targetId: "victim",
});

describe("processAuditEntry", () => {
  it("ignores unwatched entries", async () => {
    const res = await processAuditEntry({
      entry: { action: AuditLogEvent.MessagePin, executorId: "x" },
      guild: baseGuild(),
      guildConfig: enabledConfig(),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(res.action).toBe("ignored");
  });

  it("does nothing when anti-nuke is disabled", async () => {
    const res = await processAuditEntry({
      entry: banEntry(),
      guild: baseGuild(),
      guildConfig: { antinuke: { enabled: false }, whitelist: [] },
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(res.action).toBe("disabled");
  });

  it("exempts the guild owner and the bot itself", async () => {
    const owner = await processAuditEntry({
      entry: banEntry("owner"),
      guild: baseGuild(),
      guildConfig: enabledConfig(),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(owner.action).toBe("exempt_owner");

    const self = await processAuditEntry({
      entry: banEntry("bot"),
      guild: baseGuild(),
      guildConfig: enabledConfig(),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(self.action).toBe("exempt_self");
  });

  it("exempts a whitelisted executor", async () => {
    const d = deps();
    const res = await processAuditEntry({
      entry: banEntry("attacker"),
      guild: baseGuild(),
      guildConfig: { ...enabledConfig(), whitelist: [{ targetId: "attacker", type: "user" }] },
      state: new AntinukeState(() => 1000),
      deps: d,
      logger,
    });
    expect(res.action).toBe("exempt_whitelist");
    expect(d.applyPunishment).not.toHaveBeenCalled();
  });

  it("keeps a whitelisted executor exempt while under the whitelist limit", async () => {
    const d = deps();
    const guildConfig = {
      ...enabledConfig({
        whitelistLimitEnabled: true,
        whitelistLimits: { ban: { enabled: true, limit: 3, windowSec: 30 } },
      }),
      whitelist: [{ targetId: "attacker", type: "user" }],
    };
    const state = new AntinukeState(() => 1000);
    const res = await processAuditEntry({
      entry: banEntry("attacker"),
      guild: baseGuild(),
      guildConfig,
      state,
      deps: d,
      logger,
    });
    expect(res.action).toBe("exempt_whitelist_under");
    expect(d.applyPunishment).not.toHaveBeenCalled();
  });

  it("punishes a whitelisted executor who exceeds their per-action whitelist limit", async () => {
    const d = deps();
    const guildConfig = {
      ...enabledConfig({
        whitelistLimitEnabled: true,
        whitelistLimits: { ban: { enabled: true, limit: 3, windowSec: 30 } },
      }),
      whitelist: [{ targetId: "attacker", type: "user" }],
    };
    const state = new AntinukeState(() => 1000);
    let res;
    for (let i = 0; i < 3; i++) {
      res = await processAuditEntry({
        entry: banEntry("attacker"),
        guild: baseGuild(),
        guildConfig,
        state,
        deps: d,
        logger,
      });
    }
    expect(res.action).toBe("punished");
    expect(d.applyPunishment).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringContaining("whitelisted user exceeded") }),
    );
  });

  it("ignores whitelist limits when the master toggle is off", async () => {
    const d = deps();
    const guildConfig = {
      ...enabledConfig({
        whitelistLimitEnabled: false,
        whitelistLimits: { ban: { enabled: true, limit: 1, windowSec: 30 } },
      }),
      whitelist: [{ targetId: "attacker", type: "user" }],
    };
    const res = await processAuditEntry({
      entry: banEntry("attacker"),
      guild: baseGuild(),
      guildConfig,
      state: new AntinukeState(() => 1000),
      deps: d,
      logger,
    });
    expect(res.action).toBe("exempt_whitelist");
    expect(d.applyPunishment).not.toHaveBeenCalled();
  });

  it("stays quiet under the threshold", async () => {
    const state = new AntinukeState(() => 1000);
    const d = deps();
    // ban default limit is 5; a single event stays under
    const res = await processAuditEntry({
      entry: banEntry(),
      guild: baseGuild(),
      guildConfig: enabledConfig(),
      state,
      deps: d,
      logger,
    });
    expect(res.action).toBe("under_threshold");
    expect(d.applyPunishment).not.toHaveBeenCalled();
  });

  it("punishes, reverts (when enabled), and alerts once the threshold is hit", async () => {
    const state = new AntinukeState(() => 1000);
    const d = deps();
    const guildConfig = enabledConfig({ autoRevert: true });
    // channelDelete default limit is 3 -> need 3 events to trigger
    const entry = {
      action: AuditLogEvent.ChannelDelete,
      executorId: "attacker",
      target: { name: "gen", type: 0 },
    };
    let res;
    for (let i = 0; i < 3; i++) {
      res = await processAuditEntry({ entry, guild: baseGuild(), guildConfig, state, deps: d, logger });
    }
    expect(res.action).toBe("punished");
    expect(d.applyPunishment).toHaveBeenCalledWith(expect.objectContaining({ type: "ban" }));
    expect(d.revertAction).toHaveBeenCalled();
    expect(d.sendAlert).toHaveBeenCalled();
  });

  it("triggers on the first event in panic mode", async () => {
    const d = deps();
    const res = await processAuditEntry({
      entry: banEntry(),
      guild: baseGuild(),
      guildConfig: enabledConfig({ panicMode: true }),
      state: new AntinukeState(() => 1000),
      deps: d,
      logger,
    });
    expect(res.action).toBe("punished");
    expect(d.applyPunishment).toHaveBeenCalled();
  });
});
