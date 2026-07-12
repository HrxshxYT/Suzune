import { describe, it, expect, vi } from "vitest";
import { processMemberAdd } from "../../../src/modules/antinuke/raid.js";
import { AntinukeState } from "../../../src/modules/antinuke/AntinukeState.js";

const logger = { error: vi.fn(), warn: vi.fn() };
const member = () => ({ id: "j1", guild: { id: "g1" }, kick: vi.fn(async () => {}) });

function cfg(overrides = {}) {
  return {
    antinuke: {
      enabled: true,
      antiRaidEnabled: true,
      raidJoinCount: 3,
      raidWindowSec: 10,
      alertChannelId: "c1",
      ...overrides,
    },
  };
}
function deps() {
  return { kickMember: vi.fn(async () => {}), sendAlert: vi.fn(async () => true) };
}

describe("processMemberAdd", () => {
  it("does nothing when anti-raid is disabled", async () => {
    const res = await processMemberAdd({
      member: member(),
      guildConfig: cfg({ antiRaidEnabled: false }),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(res.action).toBe("disabled");
  });

  it("stays quiet below the join spike", async () => {
    const res = await processMemberAdd({
      member: member(),
      guildConfig: cfg(),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(res.action).toBe("under_threshold");
  });

  it("exempts a whitelisted joiner from the raid kick", async () => {
    const state = new AntinukeState(() => 1000);
    const d = deps();
    let res;
    for (let i = 0; i < 5; i++) {
      res = await processMemberAdd({
        member: member(),
        guildConfig: { ...cfg(), whitelist: [{ targetId: "j1", type: "user" }] },
        state,
        deps: d,
        logger,
      });
    }
    expect(res.action).toBe("exempt_whitelist");
    expect(d.kickMember).not.toHaveBeenCalled();
  });

  it("flags a raid once the join spike is reached and kicks the joiner", async () => {
    const state = new AntinukeState(() => 1000);
    const d = deps();
    let res;
    for (let i = 0; i < 3; i++) {
      res = await processMemberAdd({ member: member(), guildConfig: cfg(), state, deps: d, logger });
    }
    expect(res.action).toBe("raid");
    expect(d.kickMember).toHaveBeenCalled();
    expect(d.sendAlert).toHaveBeenCalled();
  });
});
