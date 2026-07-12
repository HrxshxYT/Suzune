import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/automod/commands/automod.js";
import { buildAutomodEmbed } from "../../../src/modules/automod/statusEmbed.js";

function ctx(automod = { enabled: true, action: "delete", antiSpam: true, exemptRoles: [], exemptChannels: [] }) {
  return {
    config: {
      updateAutomod: vi.fn(async () => ({})),
      getGuild: vi.fn(async () => ({ automod })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction() {
  return {
    guildId: "g1",
    user: { id: "mod1" },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("/automod command", () => {
  it("is admin-gated and has no subcommands", () => {
    expect(command.data.name).toBe("automod");
    expect(command.permissions.length).toBe(1);
    expect(command.data.options ?? []).toHaveLength(0);
  });

  it("opens the panel and toggles a filter on click", async () => {
    const c = ctx();
    const click = { customId: "am:tog:antiSpam:mod1", update: vi.fn(async () => {}) };
    let n = 0;
    c.awaitFn = vi.fn(async () => (n++ === 0 ? click : null));
    await command.execute(interaction(), c);
    // antiSpam was on → toggled off
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { antiSpam: false });
  });
});

describe("buildAutomodEmbed", () => {
  it("summarizes config", () => {
    const e = buildAutomodEmbed({ enabled: true, action: "timeout", antiSpam: true, filterInvites: true });
    expect(JSON.stringify(e.data)).toContain("timeout");
  });
});
