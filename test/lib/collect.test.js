import { describe, it, expect, vi } from "vitest";
import { awaitButton, disableAll } from "../../src/lib/collect.js";
import { confirmRow } from "../../src/lib/components.js";

describe("awaitButton", () => {
  it("resolves the awaited component interaction", async () => {
    const fakeInteraction = { user: { id: "u1" }, customId: "confirm:yes:u1" };
    const message = { awaitMessageComponent: vi.fn(async () => fakeInteraction) };
    const out = await awaitButton({ message, ownerId: "u1", timeMs: 50 });
    expect(out).toBe(fakeInteraction);
    // the filter passed to discord.js only allows the owner
    const { filter } = message.awaitMessageComponent.mock.calls[0][0];
    expect(filter({ user: { id: "u1" } })).toBe(true);
    expect(filter({ user: { id: "u2" } })).toBe(false);
  });
  it("returns null on timeout (rejection swallowed)", async () => {
    const message = {
      awaitMessageComponent: vi.fn(async () => Promise.reject(new Error("time"))),
    };
    expect(await awaitButton({ message, ownerId: "u1", timeMs: 10 })).toBeNull();
  });
});

describe("disableAll", () => {
  it("disables every button in the given rows", () => {
    const rows = [confirmRow("u1")];
    const out = disableAll(rows);
    const json = out[0].toJSON();
    expect(json.components.every((c) => c.disabled === true)).toBe(true);
  });
});
