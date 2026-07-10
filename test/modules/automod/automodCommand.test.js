import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/automod/commands/automod.js";
import { buildAutomodEmbed } from "../../../src/modules/automod/statusEmbed.js";

function ctx(automod = { enabled: true, action: "delete", exemptRoles: [], exemptChannels: [] }) {
  return {
    config: {
      updateAutomod: vi.fn(async () => ({})),
      getGuild: vi.fn(async () => ({ automod })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction(sub, opts = {}) {
  return {
    guildId: "g1",
    options: {
      getSubcommand: () => sub,
      getString: (k) => opts[k] ?? null,
      getRole: (k) => opts[k] ?? null,
      getChannel: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/automod", () => {
  it("is admin-gated", () => {
    expect(command.data.name).toBe("automod");
    expect(command.permissions.length).toBe(1);
  });
  it("enable turns it on", async () => {
    const c = ctx();
    await command.execute(interaction("enable"), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { enabled: true });
  });
  it("action sets the punishment", async () => {
    const c = ctx();
    await command.execute(interaction("action", { type: "timeout" }), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { action: "timeout" });
  });
  it("filter toggles a named filter to the mapped column", async () => {
    const c = ctx();
    await command.execute(interaction("filter", { name: "invites", state: "off" }), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { filterInvites: false });
  });
  it("exempt add stores a role in the exempt list", async () => {
    const c = ctx({ enabled: true, action: "delete", exemptRoles: [], exemptChannels: [] });
    await command.execute(interaction("exempt", { action: "add", role: { id: "r1" } }), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { exemptRoles: ["r1"] });
  });
  it("view replies with an embed", async () => {
    const c = ctx();
    const i = interaction("view");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("panel toggles a filter when its button is clicked", async () => {
    const c = ctx({ enabled: true, action: "delete", antiSpam: true, exemptRoles: [], exemptChannels: [] });
    const click = { customId: "toggle:spam:mod1", update: vi.fn(async () => {}) };
    let n = 0;
    const i = {
      ...interaction("panel"),
      user: { id: "mod1" },
      fetchReply: vi.fn(async () => ({})),
      editReply: vi.fn(async () => {}),
    };
    c.awaitFn = vi.fn(async () => (n++ === 0 ? click : null));
    await command.execute(i, c);
    // spam was on → toggled off
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { antiSpam: false });
  });
});

describe("buildAutomodEmbed", () => {
  it("summarizes config", () => {
    const e = buildAutomodEmbed({
      enabled: true,
      action: "timeout",
      antiSpam: true,
      filterInvites: true,
    });
    expect(JSON.stringify(e.data)).toContain("timeout");
  });
});
