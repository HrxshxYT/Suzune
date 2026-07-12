import { describe, it, expect, vi } from "vitest";
import avatar, { avatarLinks } from "../../../src/modules/util/commands/avatar.js";

const makeUser = (over = {}) => ({
  id: "u1",
  tag: "tester#0001",
  avatar: "abcdef",
  displayAvatarURL: ({ extension }) => `https://cdn/u1.${extension}`,
  fetch: async function () { return this; },
  ...over,
});

describe("avatarLinks", () => {
  it("lists png/jpg/webp for a static avatar", () => {
    const s = avatarLinks(makeUser());
    expect(s).toContain("[PNG](https://cdn/u1.png)");
    expect(s).toContain("[WebP](https://cdn/u1.webp)");
    expect(s).not.toContain("GIF");
  });
  it("adds GIF for an animated avatar", () => {
    expect(avatarLinks(makeUser({ avatar: "a_animated" }))).toContain("[GIF](https://cdn/u1.gif)");
  });
});

describe("avatar command", () => {
  it("has a name, optional user option, and no required permissions", () => {
    expect(avatar.data.name).toBe("avatar");
    expect(avatar.permissions).toEqual([]);
    expect(avatar.data.options[0].name).toBe("user");
    expect(avatar.data.options[0].required).toBeFalsy();
  });
  it("defaults to the caller and replies with an avatar embed", async () => {
    const caller = makeUser();
    const interaction = {
      user: caller,
      options: { getUser: () => null },
      guild: { members: { fetch: vi.fn(async () => ({ avatar: null })) } },
      reply: vi.fn(async () => {}),
    };
    await avatar.execute(interaction, {});
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const json = JSON.stringify(embed.data);
    expect(json).toContain("tester#0001");
    expect(json).toContain("https://cdn/u1.png"); // image or link
  });
});
