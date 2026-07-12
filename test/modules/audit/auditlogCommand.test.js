import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/audit/commands/auditlog.js";

function ctx(audit = { enabled: true, channelId: "c1", events: {} }) {
  return {
    config: {
      updateAudit: vi.fn(async () => ({})),
      getGuild: vi.fn(async () => ({ audit })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction() {
  return {
    guildId: "g1",
    user: { id: "admin1" },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("/auditlog command", () => {
  it("is admin-gated and has no subcommands", () => {
    expect(command.data.name).toBe("auditlog");
    expect(command.permissions.length).toBe(1);
    expect(command.data.options ?? []).toHaveLength(0);
  });

  it("opens the panel and toggles a category off on click", async () => {
    const c = ctx();
    const click = { customId: "au:cat:members:admin1", update: vi.fn(async () => {}) };
    let n = 0;
    c.awaitFn = vi.fn(async () => (n++ === 0 ? click : null));
    await command.execute(interaction(), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { events: { members: false } });
  });
});
