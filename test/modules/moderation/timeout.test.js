import { describe, it, expect, vi } from "vitest";
import timeout from "../../../src/modules/moderation/commands/timeout.js";

function ctx() {
  return {
    cases: { createCase: vi.fn(async (d) => ({ caseNumber: 1, ...d })) },
    config: { getGuild: vi.fn(async () => ({ dmOnAction: false })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}

function makeMember() {
  return {
    id: "t1",
    roles: { highest: { position: 3 } },
    guild: { ownerId: "owner" },
    timeout: vi.fn(async () => {}),
  };
}

function interaction(opts, member) {
  return {
    guildId: "g1",
    guild: {
      name: "T",
      ownerId: "owner",
      members: {
        me: { id: "bot", roles: { highest: { position: 100 } } },
        fetch: vi.fn(async () => member),
      },
    },
    user: { id: "mod1" },
    member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
    options: { getUser: () => ({ id: "t1", send: vi.fn() }), getString: (k) => opts[k] ?? null },
    reply: vi.fn(async () => {}),
  };
}

describe("/timeout", () => {
  it("times out a member for the parsed duration", async () => {
    const c = ctx();
    const member = makeMember();
    await timeout.execute(interaction({ duration: "10m", reason: "cool off" }, member), c);
    expect(member.timeout).toHaveBeenCalledWith(600_000, "cool off");
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "timeout" }));
  });

  it("rejects an invalid duration", async () => {
    const c = ctx();
    const i = interaction({ duration: "abc" }, makeMember());
    await timeout.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(c.cases.createCase).not.toHaveBeenCalled();
  });

  it("rejects durations over 28 days", async () => {
    const c = ctx();
    const member = makeMember();
    const i = interaction({ duration: "30d" }, member);
    await timeout.execute(i, c);
    expect(member.timeout).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
