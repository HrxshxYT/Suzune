import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { WatchVcService } from "../../../src/modules/watchvc/WatchVcService.js";

function fakeChannel({ perms = "all" } = {}) {
  const has =
    perms === "all" ? () => true : (f) => f !== PermissionFlagsBits.ManageChannels;
  return {
    id: "c1",
    guildId: "g1",
    guild: {
      id: "g1",
      memberCount: 42,
      roles: { everyone: { id: "everyone-id" } },
      members: { me: { id: "bot-id" } },
    },
    permissionsFor: () => ({ has }),
    permissionOverwrites: { set: vi.fn(async () => {}) },
  };
}

function fakeDeps() {
  const connection = { id: "conn" };
  return {
    connection,
    join: vi.fn(() => connection),
    ready: vi.fn(async () => {}),
    destroy: vi.fn(),
    onDisconnect: vi.fn(),
    setStatus: vi.fn(async () => {}),
    clearStatus: vi.fn(async () => {}),
  };
}

function fakeConfig() {
  return { updateWatchVc: vi.fn(async () => {}), getGuild: vi.fn(async () => ({ watchVc: null })) };
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("WatchVcService.enable", () => {
  it("locks, joins, writes status, and persists when perms are present", async () => {
    const deps = fakeDeps();
    const config = fakeConfig();
    const svc = new WatchVcService({ client: {}, logger, config, deps });
    const ch = fakeChannel();
    const res = await svc.enable(ch);
    expect(res.ok).toBe(true);
    expect(ch.permissionOverwrites.set).toHaveBeenCalled();
    expect(deps.join).toHaveBeenCalledWith(ch);
    expect(deps.setStatus).toHaveBeenCalledWith("c1", "🛡️ Guarding 42 members");
    expect(config.updateWatchVc).toHaveBeenCalledWith("g1", { channelId: "c1", enabled: true });
    expect(svc.currentChannelId("g1")).toBe("c1");
  });

  it("fails fast without side effects when Manage Channels is missing", async () => {
    const deps = fakeDeps();
    const svc = new WatchVcService({ client: {}, logger, config: fakeConfig(), deps });
    const ch = fakeChannel({ perms: "no-manage" });
    const res = await svc.enable(ch);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Manage Channels/);
    expect(deps.join).not.toHaveBeenCalled();
    expect(ch.permissionOverwrites.set).not.toHaveBeenCalled();
  });
});

describe("WatchVcService.disable", () => {
  it("destroys, clears status, persists disabled", async () => {
    const deps = fakeDeps();
    const config = fakeConfig();
    const svc = new WatchVcService({ client: {}, logger, config, deps });
    await svc.enable(fakeChannel());
    await svc.disable("g1");
    expect(deps.destroy).toHaveBeenCalledWith(deps.connection);
    expect(deps.clearStatus).toHaveBeenCalledWith("c1");
    expect(config.updateWatchVc).toHaveBeenCalledWith("g1", { enabled: false });
    expect(svc.currentChannelId("g1")).toBe(null);
  });
});

describe("WatchVcService.refreshStatus", () => {
  it("debounces and writes the current member count", async () => {
    vi.useFakeTimers();
    const deps = fakeDeps();
    const client = { guilds: { cache: new Map([["g1", { memberCount: 99 }]]) } };
    const svc = new WatchVcService({ client, logger, config: fakeConfig(), deps, debounceMs: 1000 });
    await svc.enable(fakeChannel());
    deps.setStatus.mockClear();
    svc.refreshStatus("g1");
    svc.refreshStatus("g1");
    expect(deps.setStatus).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.setStatus).toHaveBeenCalledTimes(1);
    expect(deps.setStatus).toHaveBeenCalledWith("c1", "🛡️ Guarding 99 members");
    vi.useRealTimers();
  });
});
