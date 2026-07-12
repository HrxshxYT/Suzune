import { describe, it, expect, vi } from "vitest";
import { TUTORIAL_CHAPTERS, renderChapter, chapterCount } from "../../../src/modules/util/tutorial.js";
import command from "../../../src/modules/util/commands/tutorial.js";
import { COLORS } from "../../../src/lib/constants.js";

describe("tutorial content", () => {
  it("has multiple chapters covering the core systems", () => {
    expect(chapterCount()).toBe(TUTORIAL_CHAPTERS.length);
    expect(chapterCount()).toBeGreaterThanOrEqual(9);
    const titles = TUTORIAL_CHAPTERS.map((c) => c.title.toLowerCase()).join(" ");
    for (const kw of ["start", "moderation", "anti-nuke", "auto", "log", "welcome", "leveling", "invite"]) {
      expect(titles).toContain(kw);
    }
  });

  it("renderChapter returns a green embed with a chapter counter", () => {
    const e = renderChapter(0).toJSON();
    expect(e.color).toBe(COLORS.brand);
    expect(e.title).toContain("1/");
    expect(e.description.length).toBeGreaterThan(0);
  });

  it("clamps out-of-range indices", () => {
    expect(() => renderChapter(-1)).not.toThrow();
    expect(() => renderChapter(999)).not.toThrow();
    expect(renderChapter(999).toJSON().title).toContain(`${chapterCount()}/`);
  });
});

describe("/tutorial command", () => {
  it("is available to everyone and replies with an embed", async () => {
    expect(command.data.name).toBe("tutorial");
    expect(command.permissions).toEqual([]);
    const interaction = {
      user: { id: "u1" },
      reply: vi.fn(async () => {}),
      fetchReply: vi.fn(async () => ({})),
      editReply: vi.fn(async () => {}),
    };
    // inject a fake awaitFn that immediately times out so the loop exits
    await command.execute(interaction, { awaitFn: async () => null });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
});
