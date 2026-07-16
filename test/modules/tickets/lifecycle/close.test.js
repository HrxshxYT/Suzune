import { describe, it, expect, vi } from "vitest";
import {
  archivedControls, handleClose, handleCloseConfirm, handleDelete, handleReopen, handleTranscript,
} from "../../../../src/modules/tickets/lifecycle/close.js";

vi.mock("../../../../src/modules/tickets/transcript.js", () => ({
  buildTranscript: vi.fn(async () => ({ buffer: Buffer.from("t"), filename: "ticket-1.txt" })),
}));

const ticket = (over = {}) => ({ id: "t1", number: 1, openerId: "u1", channelId: "chan1", categoryId: "c1", ...over });

describe("archivedControls", () => {
  it("exposes reopen/transcript/delete ids", () => {
    const ids = archivedControls("t1").components.map((c) => c.data.custom_id);
    expect(ids).toEqual(["ticket:reopen:t1", "ticket:transcript:t1", "ticket:delete:t1"]);
  });
});

describe("handleClose", () => {
  it("asks for confirmation", async () => {
    const i = { reply: vi.fn(async () => ({})) };
    await handleClose(i, {}, ticket());
    const payload = i.reply.mock.calls[0][0];
    expect(payload.ephemeral).toBe(true);
    expect(payload.components[0].components[0].data.custom_id).toBe("ticket:closeconfirm:t1");
  });
});

describe("handleCloseConfirm", () => {
  it("archives: sets status, removes opener, renames, swaps controls", async () => {
    const channel = {
      permissionOverwrites: { delete: vi.fn(async () => ({})) },
      setName: vi.fn(async () => ({})),
      messages: { fetch: vi.fn(async () => null) },
    };
    const ctx = { tickets: { setStatus: vi.fn(async () => ({})), getCategory: vi.fn(async () => ({ label: "General" })) }, logger: { error: vi.fn() } };
    const i = {
      guild: { channels: { fetch: vi.fn(async () => channel) } },
      message: { edit: vi.fn(async () => ({})) },
      deferUpdate: vi.fn(async () => ({})),
      editReply: vi.fn(async () => ({})),
      channel,
    };
    await handleCloseConfirm(i, ctx, ticket());
    expect(ctx.tickets.setStatus).toHaveBeenCalledWith("t1", "archived");
    expect(channel.permissionOverwrites.delete).toHaveBeenCalledWith("u1");
    expect(channel.setName).toHaveBeenCalledWith("closed-1");
  });
});

describe("handleReopen", () => {
  it("reopens: sets status, restores opener overwrite, renames with prefix, swaps controls", async () => {
    const channel = {
      permissionOverwrites: { edit: vi.fn(async () => ({})) },
      setName: vi.fn(async () => ({})),
      messages: { fetch: vi.fn(async () => null) },
    };
    const ctx = {
      tickets: {
        setStatus: vi.fn(async () => ({})),
        getCategory: vi.fn(async () => ({ namePrefix: "support" })),
      },
      logger: { error: vi.fn() },
    };
    const i = {
      guild: { channels: { fetch: vi.fn(async () => channel) } },
      deferUpdate: vi.fn(async () => ({})),
      editReply: vi.fn(async () => ({})),
      channel,
    };
    await handleReopen(i, ctx, ticket());
    expect(ctx.tickets.setStatus).toHaveBeenCalledWith("t1", "open");
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith("u1", {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    expect(channel.setName).toHaveBeenCalledWith("support-1");
    expect(i.editReply).toHaveBeenCalled();
  });

  it("falls back to the 'ticket' prefix when no category/namePrefix is found", async () => {
    const channel = {
      permissionOverwrites: { edit: vi.fn(async () => ({})) },
      setName: vi.fn(async () => ({})),
      messages: { fetch: vi.fn(async () => null) },
    };
    const ctx = {
      tickets: {
        setStatus: vi.fn(async () => ({})),
        getCategory: vi.fn(async () => null),
      },
      logger: { error: vi.fn() },
    };
    const i = {
      guild: { channels: { fetch: vi.fn(async () => channel) } },
      deferUpdate: vi.fn(async () => ({})),
      editReply: vi.fn(async () => ({})),
      channel,
    };
    await handleReopen(i, ctx, ticket());
    expect(channel.setName).toHaveBeenCalledWith("ticket-1");
  });
});

describe("handleTranscript", () => {
  it("builds the transcript and replies with an ephemeral file", async () => {
    const channel = { id: "chan1" };
    const ctx = {
      tickets: { getCategory: vi.fn(async () => ({ label: "General" })) },
      logger: { error: vi.fn() },
    };
    const i = {
      channel,
      deferReply: vi.fn(async () => ({})),
      editReply: vi.fn(async () => ({})),
    };
    await handleTranscript(i, ctx, ticket());
    expect(ctx.tickets.getCategory).toHaveBeenCalledWith("c1");
    expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const payload = i.editReply.mock.calls[0][0];
    expect(payload.files).toHaveLength(1);
  });
});

describe("handleDelete", () => {
  it("posts a transcript to the configured channel then deletes the channel", async () => {
    const transcriptChannel = { send: vi.fn(async () => ({})) };
    const ticketChannel = { delete: vi.fn(async () => ({})), messages: { fetch: vi.fn(async () => null) } };
    const ctx = {
      tickets: {
        getConfig: vi.fn(async () => ({ transcriptChannelId: "tc1", dmTranscript: false })),
        getCategory: vi.fn(async () => ({ label: "General" })),
        setStatus: vi.fn(async () => ({})),
      },
      client: { users: { fetch: vi.fn(async () => ({ send: vi.fn() })) } },
      logger: { error: vi.fn() },
    };
    const i = {
      guildId: "g1",
      guild: { channels: { fetch: vi.fn(async (id) => (id === "tc1" ? transcriptChannel : ticketChannel)) } },
      channel: ticketChannel,
      deferReply: vi.fn(async () => ({})),
      editReply: vi.fn(async () => ({})),
    };
    await handleDelete(i, ctx, ticket());
    expect(transcriptChannel.send).toHaveBeenCalled();
    expect(ctx.tickets.setStatus).toHaveBeenCalledWith("t1", "closed", expect.any(Date));
    expect(ticketChannel.delete).toHaveBeenCalled();
  });
});
