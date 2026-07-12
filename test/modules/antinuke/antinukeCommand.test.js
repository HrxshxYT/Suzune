import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/antinuke/commands/antinuke.js";
import { buildWhitelistEmbed } from "../../../src/modules/antinuke/statusEmbed.js";

function ctx() {
  return {
    config: {
      updateAntinuke: vi.fn(async () => ({})),
      addWhitelist: vi.fn(async () => ({})),
      removeWhitelist: vi.fn(async () => {}),
      getGuild: vi.fn(async () => ({
        antinuke: { enabled: false, punishment: "ban", autoRevert: true },
        whitelist: [],
      })),
    },
    logger: { info: vi.fn(), error: vi.fn() },
  };
}

function interaction() {
  return {
    guildId: "g1",
    guild: { id: "g1" },
    user: { id: "admin1" },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("/antinuke command", () => {
  it("is admin-gated, named, and has no subcommands", () => {
    expect(command.data.name).toBe("antinuke");
    expect(command.permissions.length).toBe(1);
    expect(command.data.options ?? []).toHaveLength(0);
  });

  it("opens the panel (ephemeral reply) and toggles enabled on click", async () => {
    const c = ctx();
    const click = { customId: "an:tog:enabled:admin1", user: { id: "admin1" }, update: vi.fn(async () => {}) };
    let n = 0;
    c.awaitFn = vi.fn(async () => (n++ === 0 ? click : null));
    await command.execute(interaction(), c);
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { enabled: true });
  });
});

describe("buildWhitelistEmbed", () => {
  it("mentions whitelisted users and roles", () => {
    const e = buildWhitelistEmbed([{ targetId: "u1", type: "user" }, { targetId: "r1", type: "role" }]);
    const json = JSON.stringify(e.data);
    expect(json).toContain("<@u1>");
    expect(json).toContain("<@&r1>");
  });
});
