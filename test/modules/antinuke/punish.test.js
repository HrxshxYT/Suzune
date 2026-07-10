import { describe, it, expect, vi } from "vitest";
import { applyPunishment } from "../../../src/modules/antinuke/punish.js";

const logger = { error: vi.fn() };
const makeGuild = () => ({ bans: { create: vi.fn(async () => {}) } });
const makeMember = () => ({ kick: vi.fn(async () => {}), roles: { set: vi.fn(async () => {}) } });

describe("applyPunishment", () => {
  it("bans via guild.bans.create", async () => {
    const guild = makeGuild();
    const out = await applyPunishment({
      type: "ban",
      guild,
      executorId: "u1",
      reason: "nuke",
      logger,
    });
    expect(out).toBe("ban");
    expect(guild.bans.create).toHaveBeenCalledWith("u1", { reason: "nuke" });
  });

  it("kicks via member.kick", async () => {
    const member = makeMember();
    const out = await applyPunishment({
      type: "kick",
      guild: makeGuild(),
      member,
      reason: "nuke",
      logger,
    });
    expect(out).toBe("kick");
    expect(member.kick).toHaveBeenCalledWith("nuke");
  });

  it("strips roles via member.roles.set([])", async () => {
    const member = makeMember();
    const out = await applyPunishment({
      type: "strip",
      guild: makeGuild(),
      member,
      reason: "nuke",
      logger,
    });
    expect(out).toBe("strip");
    expect(member.roles.set).toHaveBeenCalledWith([], "nuke");
  });

  it("quarantines by setting only the quarantine role", async () => {
    const member = makeMember();
    const out = await applyPunishment({
      type: "quarantine",
      guild: makeGuild(),
      member,
      quarantineRoleId: "q1",
      reason: "nuke",
      logger,
    });
    expect(out).toBe("quarantine");
    expect(member.roles.set).toHaveBeenCalledWith(["q1"], "nuke");
  });

  it("returns 'failed' and logs when the API throws", async () => {
    const guild = {
      bans: {
        create: vi.fn(async () => {
          throw new Error("no perms");
        }),
      },
    };
    const out = await applyPunishment({
      type: "ban",
      guild,
      executorId: "u1",
      reason: "nuke",
      logger,
    });
    expect(out).toBe("failed");
    expect(logger.error).toHaveBeenCalled();
  });
});
