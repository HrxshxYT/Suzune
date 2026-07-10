import { describe, it, expect, vi } from "vitest";
import ban from "../../../src/modules/moderation/commands/ban.js";
import kick from "../../../src/modules/moderation/commands/kick.js";
import unban from "../../../src/modules/moderation/commands/unban.js";

function ctx() {
  return {
    cases: { createCase: vi.fn(async (d) => ({ caseNumber: 1, ...d })) },
    config: { getGuild: vi.fn(async () => ({ dmOnAction: false })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}

function guild() {
  return {
    name: "Test",
    ownerId: "owner",
    members: {
      me: { id: "bot", roles: { highest: { position: 100 } } },
      fetch: vi.fn(async (id) => ({
        id,
        roles: { highest: { position: 3 } },
        guild: { ownerId: "owner" },
        kick: vi.fn(async () => {}),
      })),
    },
    bans: { create: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
  };
}

function interaction(opts, g = guild()) {
  return {
    guildId: "g1",
    guild: g,
    user: { id: "mod1" },
    member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
    options: {
      getUser: (k) => opts[k] ?? null,
      getString: (k) => opts[k] ?? null,
      getInteger: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/ban", () => {
  it("bans, records a case, and replies with a case embed", async () => {
    const c = ctx();
    const g = guild();
    const i = interaction({ user: { id: "target1", send: vi.fn() }, reason: "spam" }, g);
    await ban.execute(i, c);
    expect(g.bans.create).toHaveBeenCalledWith(
      "target1",
      expect.objectContaining({ reason: "spam" }),
    );
    expect(c.cases.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ban", targetId: "target1" }),
    );
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("refuses when the target outranks the actor", async () => {
    const c = ctx();
    const g = guild();
    g.members.fetch = vi.fn(async (id) => ({
      id,
      roles: { highest: { position: 90 } },
      guild: { ownerId: "owner" },
    }));
    const i = interaction({ user: { id: "target1" } }, g);
    await ban.execute(i, c);
    expect(g.bans.create).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});

describe("/kick", () => {
  it("kicks a member and records a case", async () => {
    const c = ctx();
    const member = {
      id: "t1",
      roles: { highest: { position: 3 } },
      guild: { ownerId: "owner" },
      kick: vi.fn(async () => {}),
    };
    const g = guild();
    g.members.fetch = vi.fn(async () => member);
    const i = interaction({ user: { id: "t1" }, reason: "rude" }, g);
    await kick.execute(i, c);
    expect(member.kick).toHaveBeenCalled();
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "kick" }));
  });
});

describe("/unban", () => {
  it("removes a ban and records an unban case", async () => {
    const c = ctx();
    const g = guild();
    const i = interaction({ user_id: "banned1", reason: "appeal" }, g);
    await unban.execute(i, c);
    expect(g.bans.remove).toHaveBeenCalledWith("banned1", expect.any(String));
    expect(c.cases.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ type: "unban", targetId: "banned1" }),
    );
  });
});
