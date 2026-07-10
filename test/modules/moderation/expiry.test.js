import { describe, it, expect, vi } from "vitest";
import { sweepExpired } from "../../../src/modules/moderation/expiry.js";

describe("sweepExpired", () => {
  it("lifts due temp bans and deactivates their cases", async () => {
    const remove = vi.fn(async () => {});
    const client = { guilds: { cache: new Map([["g1", { bans: { remove } }]]) } };
    const caseService = {
      dueExpired: vi.fn(async () => [{ id: "c1", guildId: "g1", targetId: "u1" }]),
      deactivate: vi.fn(async () => {}),
    };
    const count = await sweepExpired({
      client,
      caseService,
      logger: { error: vi.fn(), info: vi.fn() },
    });
    expect(count).toBe(1);
    expect(remove).toHaveBeenCalledWith("u1", expect.any(String));
    expect(caseService.deactivate).toHaveBeenCalledWith("c1");
  });

  it("still deactivates when the guild is not on this shard", async () => {
    const client = { guilds: { cache: new Map() } };
    const caseService = {
      dueExpired: vi.fn(async () => [{ id: "c2", guildId: "gX", targetId: "u2" }]),
      deactivate: vi.fn(async () => {}),
    };
    const count = await sweepExpired({
      client,
      caseService,
      logger: { error: vi.fn(), info: vi.fn() },
    });
    expect(count).toBe(1);
    expect(caseService.deactivate).toHaveBeenCalledWith("c2");
  });
});
