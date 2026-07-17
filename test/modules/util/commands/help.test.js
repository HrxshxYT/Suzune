import { describe, it, expect, vi } from "vitest";
import help from "../../../../src/modules/util/commands/help.js";

function commandsMap() {
  return new Map([
    ["ban", { data: { name: "ban", description: "Ban a user" }, category: "moderation", permissions: [1] }],
    ["kick", { data: { name: "kick", description: "Kick a user" }, category: "moderation", permissions: [1] }],
    ["ping", { data: { name: "ping", description: "Latency" }, category: "util", permissions: [] }],
  ]);
}

// A fake component interaction the injected awaitFn can hand back.
function fakeComponent(customId, value) {
  return { customId, values: [value], update: vi.fn(async () => {}) };
}

// Returns an awaitFn that yields the given interactions in order, then null (timeout).
function scriptedAwait(interactions) {
  const queue = [...interactions];
  return vi.fn(async () => queue.shift() ?? null);
}

// Extracts the custom_ids of the select menus in a reply/update payload.
function selectIds(payload) {
  return (payload.components ?? []).map((row) => row.toJSON().components[0].custom_id);
}

function baseInteraction({ getString = () => null } = {}) {
  return {
    user: { id: "u1" },
    options: { getString },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({ id: "msg1" })),
    editReply: vi.fn(async () => {}),
  };
}

describe("/help no-argument browser", () => {
  it("opens with the home card image and a category select", async () => {
    const i = baseInteraction();
    const ctx = { commands: commandsMap(), awaitFn: scriptedAwait([]) };
    await help.execute(i, ctx);

    const payload = i.reply.mock.calls[0][0];
    expect(Array.isArray(payload.files)).toBe(true);
    expect(payload.files.length).toBe(1);
    expect(selectIds(payload)).toEqual(["help:cat:u1"]);
  });

  it("selecting a category shows its card and adds a command select", async () => {
    const pick = fakeComponent("help:cat:u1", "moderation");
    const i = baseInteraction();
    const ctx = { commands: commandsMap(), awaitFn: scriptedAwait([pick]) };
    await help.execute(i, ctx);

    const payload = pick.update.mock.calls[0][0];
    expect(payload.files.length).toBe(1); // category card image
    expect(selectIds(payload)).toEqual(["help:cat:u1", "help:cmd:u1"]);
  });

  it("selecting a command shows its detail embed and drops the image", async () => {
    const catPick = fakeComponent("help:cat:u1", "moderation");
    const cmdPick = fakeComponent("help:cmd:u1", "ban");
    const i = baseInteraction();
    const ctx = { commands: commandsMap(), awaitFn: scriptedAwait([catPick, cmdPick]) };
    await help.execute(i, ctx);

    const payload = cmdPick.update.mock.calls[0][0];
    expect(payload.files).toEqual([]);
    expect(JSON.stringify(payload.embeds[0].data)).toContain("Ban a user");
    expect(selectIds(payload)).toEqual(["help:cat:u1", "help:cmd:u1"]);
  });

  it("returns to home when the Home option is chosen", async () => {
    const catPick = fakeComponent("help:cat:u1", "moderation");
    const homePick = fakeComponent("help:cat:u1", "home");
    const i = baseInteraction();
    const ctx = { commands: commandsMap(), awaitFn: scriptedAwait([catPick, homePick]) };
    await help.execute(i, ctx);

    const payload = homePick.update.mock.calls[0][0];
    expect(payload.files.length).toBe(1);
    expect(selectIds(payload)).toEqual(["help:cat:u1"]); // command select gone
  });

  it("disables the components on timeout", async () => {
    const i = baseInteraction();
    const ctx = { commands: commandsMap(), awaitFn: scriptedAwait([]) };
    await help.execute(i, ctx);

    expect(i.editReply).toHaveBeenCalled();
    const rows = i.editReply.mock.calls.at(-1)[0].components;
    expect(rows[0].toJSON().components[0].disabled).toBe(true);
  });
});

describe("/help direct paths", () => {
  it("with a known command replies with its detail embed", async () => {
    const i = baseInteraction({ getString: () => "ban" });
    await help.execute(i, { commands: commandsMap() });
    const payload = i.reply.mock.calls[0][0];
    expect(JSON.stringify(payload.embeds[0].data)).toContain("Ban a user");
  });

  it("with an unknown command replies ephemerally", async () => {
    const i = baseInteraction({ getString: () => "nope" });
    await help.execute(i, { commands: commandsMap() });
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("autocomplete responds with matching command names", async () => {
    const i = { options: { getFocused: () => "ba" }, respond: vi.fn(async () => {}) };
    await help.autocomplete(i, { commands: commandsMap() });
    expect(i.respond).toHaveBeenCalledWith([{ name: "ban", value: "ban" }]);
  });
});
