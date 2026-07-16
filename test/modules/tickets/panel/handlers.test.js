// test/modules/tickets/panel/handlers.test.js
import { describe, it, expect, vi } from "vitest";
import { handleTicketsComponent } from "../../../../src/modules/tickets/panel/handlers.js";

const render = () => ({ embeds: [], components: [] });
const baseState = (over = {}) => ({
  guildId: "g1", ownerId: "o1", view: "home",
  config: { enabled: true, dmTranscript: false, maxOpenPerUser: 1 },
  panels: [{ id: "p1", name: "Main", title: "T", description: "D", messageId: null, channelId: null, categories: [] }],
  selectedPanelId: null,
  ...over,
});
const ctx = (over = {}) => ({
  tickets: {
    updateConfig: vi.fn(async () => ({})),
    createPanel: vi.fn(async () => ({ id: "p2", name: "New", categories: [] })),
    listPanels: vi.fn(async () => []),
    getPanel: vi.fn(async () => null),
    setPublished: vi.fn(async () => ({})),
    ...over,
  },
});

describe("handleTicketsComponent", () => {
  it("returns close for the close button", async () => {
    const dir = await handleTicketsComponent({ customId: "tk:close:o1", user: { id: "o1" } }, baseState(), ctx(), render);
    expect(dir).toBe("close");
  });

  it("toggles a boolean config field and persists", async () => {
    const c = ctx();
    const s = baseState();
    const dir = await handleTicketsComponent({ customId: "tk:tog:enabled:o1", user: { id: "o1" } }, s, c, render);
    expect(dir).toBe("update");
    expect(c.tickets.updateConfig).toHaveBeenCalledWith("g1", { enabled: false });
    expect(s.config.enabled).toBe(false);
  });

  it("sets the transcript channel from a channel select", async () => {
    const c = ctx();
    const s = baseState();
    await handleTicketsComponent({ customId: "tk:transcriptch:o1", values: ["chX"], user: { id: "o1" } }, s, c, render);
    expect(c.tickets.updateConfig).toHaveBeenCalledWith("g1", { transcriptChannelId: "chX" });
    expect(s.config.transcriptChannelId).toBe("chX");
  });

  it("selecting a panel switches to the editor view", async () => {
    const s = baseState();
    const dir = await handleTicketsComponent({ customId: "tk:selpanel:o1", values: ["p1"], user: { id: "o1" } }, s, ctx(), render);
    expect(dir).toBe("update");
    expect(s.view).toBe("panel");
    expect(s.selectedPanelId).toBe("p1");
  });

  it("back returns to home", async () => {
    const s = baseState({ view: "panel", selectedPanelId: "p1" });
    await handleTicketsComponent({ customId: "tk:back:o1", user: { id: "o1" } }, s, ctx(), render);
    expect(s.view).toBe("home");
  });

  describe("maxopen modal", () => {
    it("success: parses value, persists, updates state, returns handled", async () => {
      const c = ctx();
      const s = baseState();
      const sub = {
        fields: { getTextInputValue: (name) => (name === "n" ? "5" : "") },
        deferUpdate: vi.fn(async () => {}),
        editReply: vi.fn(async () => {}),
      };
      const i = {
        customId: "tk:maxopen:o1",
        user: { id: "o1" },
        showModal: vi.fn(async () => {}),
        awaitModalSubmit: vi.fn(async () => sub),
      };
      const dir = await handleTicketsComponent(i, s, c, render);
      expect(dir).toBe("handled");
      expect(c.tickets.updateConfig).toHaveBeenCalledWith("g1", { maxOpenPerUser: 5 });
      expect(s.config.maxOpenPerUser).toBe(5);
      expect(sub.editReply).toHaveBeenCalled();
    });

    it("timeout: awaitModalSubmit rejects, returns handled without throwing", async () => {
      const c = ctx();
      const s = baseState();
      const i = {
        customId: "tk:maxopen:o1",
        user: { id: "o1" },
        showModal: vi.fn(async () => {}),
        awaitModalSubmit: vi.fn(async () => {
          throw new Error("time");
        }),
      };
      await expect(handleTicketsComponent(i, s, c, render)).resolves.toBe("handled");
      expect(c.tickets.updateConfig).not.toHaveBeenCalled();
    });
  });

  describe("newpanel modal", () => {
    it("success: creates panel, switches view, returns handled", async () => {
      const c = ctx();
      const s = baseState({ panels: [] });
      const sub = {
        fields: { getTextInputValue: (name) => (name === "name" ? "New Panel" : "") },
        deferUpdate: vi.fn(async () => {}),
        editReply: vi.fn(async () => {}),
      };
      const i = {
        customId: "tk:newpanel:o1",
        user: { id: "o1" },
        showModal: vi.fn(async () => {}),
        awaitModalSubmit: vi.fn(async () => sub),
      };
      const dir = await handleTicketsComponent(i, s, c, render);
      expect(dir).toBe("handled");
      expect(c.tickets.createPanel).toHaveBeenCalledWith("g1", { name: "New Panel" });
      expect(s.view).toBe("panel");
      expect(s.selectedPanelId).toBe("p2");
      expect(sub.editReply).toHaveBeenCalled();
    });
  });

  describe("publish", () => {
    it("zero categories: refuses via reply, does not publish, returns handled", async () => {
      const c = ctx({ getPanel: vi.fn(async () => ({ id: "p1", categories: [] })) });
      const s = baseState();
      const i = {
        customId: "tk:publish:o1",
        user: { id: "o1" },
        deferReply: vi.fn(async () => {}),
        editReply: vi.fn(async () => {}),
        reply: vi.fn(async () => {}),
      };
      const dir = await handleTicketsComponent(i, s, c, render);
      expect(dir).toBe("handled");
      expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(i.editReply).toHaveBeenCalledTimes(1);
      expect(c.tickets.setPublished).not.toHaveBeenCalled();
    });

    it("first publish: sends to current channel and marks published", async () => {
      const panel = {
        id: "p1",
        title: "T",
        description: "D",
        channelId: null,
        messageId: null,
        categories: [{ id: "c1", label: "General" }],
      };
      const c = ctx({ getPanel: vi.fn(async () => panel) });
      const s = baseState();
      const sentMessage = { id: "msg1" };
      const i = {
        customId: "tk:publish:o1",
        user: { id: "o1" },
        channel: { id: "c1", send: vi.fn(async () => sentMessage) },
        deferReply: vi.fn(async () => {}),
        editReply: vi.fn(async () => {}),
        reply: vi.fn(async () => {}),
      };
      const dir = await handleTicketsComponent(i, s, c, render);
      expect(dir).toBe("handled");
      expect(i.channel.send).toHaveBeenCalledTimes(1);
      expect(c.tickets.setPublished).toHaveBeenCalledWith("p1", "c1", "msg1");
      expect(i.editReply).toHaveBeenCalledTimes(1);
    });

    it("re-publish: edits the existing message instead of sending a new one", async () => {
      const panel = {
        id: "p1",
        title: "T",
        description: "D",
        channelId: "chX",
        messageId: "old",
        categories: [{ id: "c1", label: "General" }],
      };
      const c = ctx({ getPanel: vi.fn(async () => panel) });
      const s = baseState();
      const existingMessage = { id: "old", edit: vi.fn(async () => {}) };
      const fetchedChannel = {
        id: "chX",
        send: vi.fn(async () => ({ id: "shouldNotBeUsed" })),
        messages: { fetch: vi.fn(async () => existingMessage) },
      };
      const i = {
        customId: "tk:publish:o1",
        user: { id: "o1" },
        guild: { channels: { fetch: vi.fn(async () => fetchedChannel) } },
        channel: { id: "fallback", send: vi.fn(async () => ({ id: "shouldNotBeUsed2" })) },
        deferReply: vi.fn(async () => {}),
        editReply: vi.fn(async () => {}),
        reply: vi.fn(async () => {}),
      };
      const dir = await handleTicketsComponent(i, s, c, render);
      expect(dir).toBe("handled");
      expect(i.guild.channels.fetch).toHaveBeenCalledWith("chX");
      expect(existingMessage.edit).toHaveBeenCalledTimes(1);
      expect(fetchedChannel.send).not.toHaveBeenCalled();
      expect(c.tickets.setPublished).toHaveBeenCalledWith("p1", "chX", "old");
    });
  });

  describe("stale selectedPanelId guard", () => {
    it("editmeta: returns update without throwing when panel is missing", async () => {
      const s = baseState({ selectedPanelId: "does-not-exist" });
      const i = { customId: "tk:editmeta:o1", user: { id: "o1" }, showModal: vi.fn(async () => {}) };
      await expect(handleTicketsComponent(i, s, ctx(), render)).resolves.toBe("update");
      expect(i.showModal).not.toHaveBeenCalled();
    });

    it("addcat: returns update without throwing when panel is missing", async () => {
      const s = baseState({ selectedPanelId: "does-not-exist" });
      const i = { customId: "tk:addcat:o1", user: { id: "o1" }, showModal: vi.fn(async () => {}) };
      await expect(handleTicketsComponent(i, s, ctx(), render)).resolves.toBe("update");
      expect(i.showModal).not.toHaveBeenCalled();
    });
  });
});
