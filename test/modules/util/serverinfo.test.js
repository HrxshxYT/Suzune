import { describe, it, expect, vi } from "vitest";
import { ChannelType } from "discord.js";
import serverinfo from "../../../src/modules/util/commands/serverinfo.js";

const guild = () => ({
  name: "Test Guild",
  id: "g1",
  ownerId: "o1",
  memberCount: 42,
  createdTimestamp: 1_600_000_000_000,
  premiumSubscriptionCount: 3,
  premiumTier: 2,
  verificationLevel: 2,
  afkChannelId: "afk1",
  afkTimeout: 300,
  features: ["COMMUNITY", "BANNER"],
  iconURL: () => "https://cdn/icon.png",
  channels: {
    cache: new Map([
      ["c1", { type: ChannelType.GuildText }],
      ["c2", { type: ChannelType.GuildVoice }],
      ["c3", { type: ChannelType.GuildCategory }],
    ]),
  },
  roles: { cache: { size: 5 } },
  emojis: { cache: { size: 7 } },
  stickers: { cache: { size: 1 } },
});

const guildWithChannels = guild;

describe("serverinfo command", () => {
  it("has a name and no required permissions", () => {
    expect(serverinfo.data.name).toBe("serverinfo");
    expect(serverinfo.permissions).toEqual([]);
  });

  it("replies with an embed describing the guild", async () => {
    const interaction = { guild: guildWithChannels(), reply: vi.fn(async () => {}) };
    await serverinfo.execute(interaction, {});
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const json = JSON.stringify(embed.data);
    expect(json).toContain("Test Guild");
    expect(json).toContain("<@o1>"); // owner
    expect(json).toContain("42"); // members
    expect(json).toContain("COMMUNITY"); // features
    expect(json).toContain("4"); // roles: 5 - 1 (@everyone)
  });
});
