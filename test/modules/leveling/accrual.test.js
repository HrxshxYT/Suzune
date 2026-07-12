import { describe, it, expect, vi } from "vitest";
import { processMessageXp } from "../../../src/modules/leveling/accrual.js";

function fakeMessage({ roles = [] } = {}) {
  const send = vi.fn(async () => {});
  const add = vi.fn(async () => {});
  const remove = vi.fn(async () => {});
  return {
    guild: { id: "g1" },
    guildId: "g1",
    author: { id: "u1", bot: false },
    channelId: "c1",
    channel: { send },
    member: { roles: { cache: new Map(roles.map((r) => [r, {}])), add, remove } },
    _spies: { send, add, remove },
  };
}

const config = (over = {}) => ({ enabled: true, xpMin: 15, xpMax: 25, cooldownSec: 60, announce: true, ignoredChannels: [], ignoredRoles: [], ...over });

function fakeService({ oldXp = 90, newXp = 110, rewards = [] } = {}) {
  return {
    addXp: vi.fn(async () => ({ oldXp, newXp })),
    getRewards: vi.fn(async () => rewards),
  };
}

const cooldowns = (limited = false) => ({ check: vi.fn(() => ({ limited })) });
const logger = { error: vi.fn(), warn: vi.fn() };

describe("processMessageXp", () => {
  it("skips when the cooldown limits the user", async () => {
    const message = fakeMessage();
    const service = fakeService();
    await processMessageXp({ message, config: config(), service, cooldowns: cooldowns(true), rng: () => 0, logger });
    expect(service.addXp).not.toHaveBeenCalled();
  });

  it("skips ineligible messages (ignored channel) without touching the cooldown", async () => {
    const message = fakeMessage();
    const service = fakeService();
    const cd = cooldowns(false);
    await processMessageXp({ message, config: config({ ignoredChannels: ["c1"] }), service, cooldowns: cd, rng: () => 0, logger });
    expect(cd.check).not.toHaveBeenCalled();
    expect(service.addXp).not.toHaveBeenCalled();
  });

  it("awards xp and announces + applies rewards on level-up", async () => {
    const message = fakeMessage({ roles: ["r5"] });
    const service = fakeService({ oldXp: 90, newXp: 110, rewards: [{ level: 1, roleId: "r10" }, { level: 5, roleId: "r5" }] });
    await processMessageXp({ message, config: config(), service, cooldowns: cooldowns(false), rng: () => 0, logger });
    expect(service.addXp).toHaveBeenCalledWith("g1", "u1", 15); // rng 0 -> xpMin
    expect(message._spies.send).toHaveBeenCalledTimes(1); // announced level-up (90->110 crosses level 1 at 100)
    expect(message._spies.add).toHaveBeenCalledWith("r10");
    expect(message._spies.remove).toHaveBeenCalledWith("r5");
  });

  it("does not announce when announce is off, but still awards xp", async () => {
    const message = fakeMessage();
    const service = fakeService({ oldXp: 90, newXp: 110, rewards: [] });
    await processMessageXp({ message, config: config({ announce: false }), service, cooldowns: cooldowns(false), rng: () => 0, logger });
    expect(service.addXp).toHaveBeenCalled();
    expect(message._spies.send).not.toHaveBeenCalled();
  });

  it("does not throw when the xp award (db) fails", async () => {
    const message = fakeMessage();
    const service = fakeService();
    service.addXp = vi.fn(async () => { throw new Error("db down"); });
    await expect(
      processMessageXp({ message, config: config(), service, cooldowns: cooldowns(false), rng: () => 0, logger }),
    ).resolves.toBeUndefined();
    expect(message._spies.send).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not throw when announce send fails", async () => {
    const message = fakeMessage();
    message.channel.send = vi.fn(async () => { throw new Error("no perms"); });
    const service = fakeService({ oldXp: 90, newXp: 110, rewards: [] });
    await expect(
      processMessageXp({ message, config: config(), service, cooldowns: cooldowns(false), rng: () => 0, logger }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
