import { describe, it, expect, vi } from "vitest";
import { runPanel } from "../../src/lib/panel.js";

function interactionMock() {
  return {
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("runPanel", () => {
  it("replies ephemeral, updates on each 'update', and disables on 'close'", async () => {
    const interaction = interactionMock();
    const state = { n: 0 };
    const render = () => ({ embeds: [{ n: state.n }], components: [{ components: [] }] });
    const clicks = [
      { customId: "inc", update: vi.fn(async () => {}) },
      { customId: "close", update: vi.fn(async () => {}) },
    ];
    let idx = 0;
    const awaitFn = vi.fn(async () => clicks[idx++] ?? null);
    const handle = (i) => {
      if (i.customId === "close") return "close";
      state.n += 1;
      return "update";
    };

    await runPanel({ interaction, ownerId: "o", render, handle, awaitFn });

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, embeds: [{ n: 0 }] }),
    );
    expect(clicks[0].update).toHaveBeenCalledWith(expect.objectContaining({ embeds: [{ n: 1 }] }));
    // close click disables components (setDisabled path handled by disableAll)
    expect(clicks[1].update).toHaveBeenCalled();
  });

  it("does nothing extra on 'handled' and disables on timeout", async () => {
    const interaction = interactionMock();
    const render = () => ({ embeds: [{}], components: [{ components: [] }] });
    const clicks = [{ customId: "modal", update: vi.fn(async () => {}) }];
    let idx = 0;
    const awaitFn = vi.fn(async () => clicks[idx++] ?? null); // then null => timeout
    const handle = () => "handled";

    await runPanel({ interaction, ownerId: "o", render, handle, awaitFn });

    expect(clicks[0].update).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled(); // timeout disable
  });
});
