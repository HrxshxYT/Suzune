import { describe, it, expect, vi } from "vitest";
import tempban from "../../../src/modules/moderation/commands/tempban.js";

function ctx() {
  return {
    cases: { createCase: vi.fn(async (d) => ({ caseNumber: 1, ...d })) },
    config: { getGuild: vi.fn(async () => ({ dmOnAction: false })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}
function interaction(opts) {
  const g = {
    name: "T",
    ownerId: "owner",
    members: {
      me: { id: "bot", roles: { highest: { position: 100 } } },
      fetch: vi.fn(async () => null),
    },
    bans: { create: vi.fn(async () => {}) },
  };
  return {
    guildId: "g1",
    guild: g,
    user: { id: "mod1" },
    member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
    options: { getUser: () => ({ id: "t1", send: vi.fn() }), getString: (k) => opts[k] ?? null },
    reply: vi.fn(async () => {}),
    _guild: g,
  };
}

describe("/tempban", () => {
  it("bans and records a tempban case with an expiry", async () => {
    const c = ctx();
    const i = interaction({ duration: "1h", reason: "raid" });
    await tempban.execute(i, c);
    expect(i._guild.bans.create).toHaveBeenCalled();
    const arg = c.cases.createCase.mock.calls[0][0];
    expect(arg.type).toBe("tempban");
    expect(arg.expiresAt instanceof Date).toBe(true);
  });

  it("rejects an invalid duration", async () => {
    const c = ctx();
    const i = interaction({ duration: "nope" });
    await tempban.execute(i, c);
    expect(i._guild.bans.create).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
