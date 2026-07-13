import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { lockOverwrites, missingLockPermissions } from "../../../src/modules/watchvc/lock.js";

describe("lockOverwrites", () => {
  it("denies Connect + allows View for @everyone and grants bot Connect", () => {
    const ows = lockOverwrites("everyone-id", "bot-id");
    const everyone = ows.find((o) => o.id === "everyone-id");
    const bot = ows.find((o) => o.id === "bot-id");
    expect(everyone.allow).toContain("ViewChannel");
    expect(everyone.deny).toContain("Connect");
    expect(bot.allow).toContain("Connect");
    expect(bot.allow).toContain("ViewChannel");
  });
});

describe("missingLockPermissions", () => {
  const perms = (has) => ({ has: (f) => has.includes(f) });
  it("returns empty when all present", () => {
    const all = [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.ViewChannel,
    ];
    expect(missingLockPermissions(perms(all))).toEqual([]);
  });
  it("reports missing Manage Channels and Connect", () => {
    const out = missingLockPermissions(perms([PermissionFlagsBits.ViewChannel]));
    expect(out).toContain("Manage Channels");
    expect(out).toContain("Connect");
  });
});
