import { describe, it, expect, vi } from "vitest";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";
import userinfo from "../../../src/modules/util/commands/userinfo.js";

const makeUser = (over = {}) => ({
  id: "u1",
  tag: "tester#0001",
  bot: false,
  createdTimestamp: 1_500_000_000_000,
  displayAvatarURL: () => "https://cdn/avatar.png",
  bannerURL: () => null,
  flags: null,
  fetch: async function () {
    return this;
  },
  ...over,
});

const makeMember = (guildId, over = {}) => ({
  guild: { id: guildId },
  nickname: "Nick",
  joinedTimestamp: 1_600_000_000_000,
  presence: { status: "online" },
  permissions: new PermissionsBitField(PermissionFlagsBits.BanMembers),
  roles: {
    cache: new Map([
      [guildId, { id: guildId, position: 0 }], // @everyone, excluded
      ["r1", { id: "r1", position: 5 }],
    ]),
  },
  ...over,
});

function interactionWith({ caller, optionUser = null, member }) {
  return {
    user: caller,
    guild: {
      id: "g1",
      members: { fetch: vi.fn(async () => member) },
    },
    options: { getUser: () => optionUser },
    reply: vi.fn(async () => {}),
  };
}

describe("userinfo command", () => {
  it("has a name, an optional user option, and no required permissions", () => {
    expect(userinfo.data.name).toBe("userinfo");
    expect(userinfo.permissions).toEqual([]);
    const opt = userinfo.data.options[0];
    expect(opt.name).toBe("user");
    expect(opt.required).toBeFalsy();
  });

  it("defaults to the caller and shows member details", async () => {
    const caller = makeUser();
    const interaction = interactionWith({ caller, member: makeMember("g1") });
    await userinfo.execute(interaction, {});
    const json = JSON.stringify(interaction.reply.mock.calls[0][0].embeds[0].data);
    expect(json).toContain("tester#0001");
    expect(json).toContain("<@u1>");
    expect(json).toContain("Online");
    expect(json).toContain("<@&r1>"); // role, @everyone excluded
    expect(json).toContain("Ban Members"); // key permission
    expect(json).not.toContain(`<@&g1>`); // @everyone not listed
  });

  it("handles a target who is not a member of the guild", async () => {
    const caller = makeUser();
    const target = makeUser({ id: "u2", tag: "outsider#0002" });
    const interaction = interactionWith({ caller, optionUser: target, member: null });
    interaction.guild.members.fetch = vi.fn(async () => {
      throw new Error("unknown member");
    });
    await userinfo.execute(interaction, {});
    const json = JSON.stringify(interaction.reply.mock.calls[0][0].embeds[0].data);
    expect(json).toContain("outsider#0002");
    expect(json).toContain("Not in this server");
  });
});
