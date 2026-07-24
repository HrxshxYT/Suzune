import { describe, it, expect, vi } from "vitest";
import { act, isExempt } from "../../../src/modules/automod/pipeline/act.js";
import { PermissionFlagsBits } from "discord.js";

const baseConfig = { heatThreshold: 100, thresholdAction: "timeout", exemptRoles: [], exemptChannels: [], timeoutSeconds: 300 };

const fakeMessage = () => ({
  guild: { id: "g", name: "S", bans: { create: vi.fn() } },
  client: { user: { id: "bot" } },
  delete: vi.fn().mockResolvedValue(),
});

describe("isExempt", () => {
  it("exempts Manage Messages holders", () => {
    const member = { permissions: { has: (p) => p === PermissionFlagsBits.ManageMessages }, roles: { cache: new Map() } };
    expect(isExempt({ member, channelId: "c", config: baseConfig })).toBe(true);
  });
  it("exempts configured channels", () => {
    const member = { permissions: { has: () => false }, roles: { cache: new Map() } };
    expect(isExempt({ member, channelId: "c", config: { ...baseConfig, exemptChannels: ["c"] } })).toBe(true);
  });
});

describe("act", () => {
  it("deletes when flagged and times out at threshold", async () => {
    const message = fakeMessage();
    const member = { id: "u", timeout: vi.fn().mockResolvedValue(), user: { id: "u" } };
    const cases = { createCase: vi.fn().mockResolvedValue({}) };
    const r = await act({
      message, member, config: baseConfig, guildConfig: { dmOnAction: false },
      deleteMessage: true, heatAfter: 120, cases, logger: { error() {} },
    });
    expect(message.delete).toHaveBeenCalled();
    expect(member.timeout).toHaveBeenCalled();
    expect(r.memberAction).toBe("timeout");
  });
  it("no member action below threshold", async () => {
    const message = fakeMessage();
    const member = { id: "u", timeout: vi.fn() };
    const cases = { createCase: vi.fn() };
    const r = await act({
      message, member, config: baseConfig, guildConfig: { dmOnAction: false },
      deleteMessage: true, heatAfter: 40, cases, logger: { error() {} },
    });
    expect(r.memberAction).toBeNull();
    expect(member.timeout).not.toHaveBeenCalled();
  });
});
