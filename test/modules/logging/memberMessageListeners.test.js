import { describe, it, expect, vi } from "vitest";
import memberAdd from "../../../src/modules/logging/events/guildMemberAdd.js";
import msgDelete from "../../../src/modules/logging/events/messageDelete.js";
import msgUpdate from "../../../src/modules/logging/events/messageUpdate.js";

function ctx() {
  const send = vi.fn(async () => {});
  return {
    config: {
      getGuild: vi.fn(async () => ({
        logging: { memberJoinLeave: "c1", messageDelete: "c1", messageEdit: "c1", disabled: [] },
      })),
    },
    logger: { error: vi.fn() },
    _send: send,
    _guild: { id: "g1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } },
  };
}

describe("member add listener", () => {
  it("logs a join", async () => {
    const c = ctx();
    await memberAdd.execute(c, { id: "u1", user: { id: "u1", tag: "a#1", bot: false }, guild: c._guild });
    expect(c._send).toHaveBeenCalled();
  });
});

describe("message delete listener", () => {
  it("ignores bot messages", async () => {
    const c = ctx();
    await msgDelete.execute(c, { author: { bot: true }, guild: c._guild, channelId: "x" });
    expect(c._send).not.toHaveBeenCalled();
  });
  it("logs a human message deletion", async () => {
    const c = ctx();
    await msgDelete.execute(c, {
      author: { id: "u1", bot: false, tag: "a#1" },
      guild: c._guild,
      channelId: "x",
      content: "hi",
    });
    expect(c._send).toHaveBeenCalled();
  });
});

describe("message update listener", () => {
  it("ignores no-op edits", async () => {
    const c = ctx();
    const msg = { author: { id: "u1", bot: false }, guild: c._guild, channelId: "x", content: "same" };
    await msgUpdate.execute(c, { ...msg }, { ...msg });
    expect(c._send).not.toHaveBeenCalled();
  });
  it("logs a real edit", async () => {
    const c = ctx();
    const base = { author: { id: "u1", bot: false }, guild: c._guild, channelId: "x" };
    await msgUpdate.execute(c, { ...base, content: "old" }, { ...base, content: "new" });
    expect(c._send).toHaveBeenCalled();
  });
});
