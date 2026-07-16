import { describe, it, expect, vi } from "vitest";
import { EmbedBuilder } from "discord.js";
import { handleClaim } from "../../../../src/modules/tickets/lifecycle/claim.js";
import { handleMembers, handleMemberPick } from "../../../../src/modules/tickets/lifecycle/members.js";

const ticket = (over = {}) => ({ id: "t1", claimedById: null, channelId: "chan1", ...over });

describe("handleClaim", () => {
  it("claims for the caller when unclaimed (no embed on the message)", async () => {
    const ctx = { tickets: { setClaim: vi.fn(async () => ({})) } };
    const i = { user: { id: "staff1" }, update: vi.fn(async () => ({})), channel: { send: vi.fn(async () => ({})) }, message: { components: [], embeds: [] } };
    await handleClaim(i, ctx, ticket());
    expect(ctx.tickets.setClaim).toHaveBeenCalledWith("t1", "staff1");
    expect(i.update).toHaveBeenCalledWith({ components: [] });
  });

  it("unclaims when the current claimer clicks again", async () => {
    const ctx = { tickets: { setClaim: vi.fn(async () => ({})) } };
    const i = { user: { id: "staff1" }, update: vi.fn(async () => ({})), channel: { send: vi.fn(async () => ({})) }, message: { components: [], embeds: [] } };
    await handleClaim(i, ctx, ticket({ claimedById: "staff1" }));
    expect(ctx.tickets.setClaim).toHaveBeenCalledWith("t1", null);
  });

  it("rebuilds the embed with a Claimed by field when claiming", async () => {
    const ctx = { tickets: { setClaim: vi.fn(async () => ({})) } };
    const i = {
      user: { id: "staff1" },
      update: vi.fn(async () => ({})),
      channel: { send: vi.fn(async () => ({})) },
      message: { components: [], embeds: [new EmbedBuilder().setTitle("Ticket #1").toJSON()] },
    };
    await handleClaim(i, ctx, ticket());
    expect(i.update).toHaveBeenCalledTimes(1);
    const payload = i.update.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(1);
    const fields = payload.embeds[0].data.fields;
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Claimed by", value: "<@staff1>" }),
    ]));
  });

  it("removes the Claimed by field when unclaiming", async () => {
    const ctx = { tickets: { setClaim: vi.fn(async () => ({})) } };
    const claimedEmbed = new EmbedBuilder()
      .setTitle("Ticket #1")
      .setFields([{ name: "Claimed by", value: "<@staff1>", inline: true }])
      .toJSON();
    const i = {
      user: { id: "staff1" },
      update: vi.fn(async () => ({})),
      channel: { send: vi.fn(async () => ({})) },
      message: { components: [], embeds: [claimedEmbed] },
    };
    await handleClaim(i, ctx, ticket({ claimedById: "staff1" }));
    const payload = i.update.mock.calls[0][0];
    const fields = payload.embeds[0].data.fields ?? [];
    expect(fields.find((f) => f.name === "Claimed by")).toBeUndefined();
  });
});

describe("handleMembers", () => {
  it("replies with a user-select carrying the ticket id", async () => {
    const i = { reply: vi.fn(async () => ({})) };
    await handleMembers(i, {}, ticket());
    const payload = i.reply.mock.calls[0][0];
    expect(payload.ephemeral).toBe(true);
    expect(payload.components[0].components[0].data.custom_id).toBe("ticket:memberpick:t1");
  });
});

describe("handleMemberPick", () => {
  function chan(existingOverwrite) {
    return {
      permissionOverwrites: {
        cache: { get: () => existingOverwrite },
        edit: vi.fn(async () => ({})),
        delete: vi.fn(async () => ({})),
      },
    };
  }
  it("adds an overwrite when the user has none", async () => {
    const channel = chan(undefined);
    const i = { values: ["u9"], guild: { channels: { fetch: vi.fn(async () => channel) } }, update: vi.fn(async () => ({})), reply: vi.fn(async () => ({})) };
    await handleMemberPick(i, {}, ticket());
    expect(channel.permissionOverwrites.edit).toHaveBeenCalled();
  });
  it("removes the overwrite when the user already has one", async () => {
    const channel = chan({ id: "u9" });
    const i = { values: ["u9"], guild: { channels: { fetch: vi.fn(async () => channel) } }, update: vi.fn(async () => ({})), reply: vi.fn(async () => ({})) };
    await handleMemberPick(i, {}, ticket());
    expect(channel.permissionOverwrites.delete).toHaveBeenCalledWith("u9");
  });
});
