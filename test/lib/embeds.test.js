import { describe, it, expect } from "vitest";
import {
  successEmbed,
  errorEmbed,
  warnEmbed,
  infoEmbed,
  brandEmbed,
  panelEmbed,
} from "../../src/lib/embeds.js";
import { COLORS } from "../../src/lib/constants.js";

describe("embeds", () => {
  it("builds a success embed with the success color", () => {
    const e = successEmbed("done");
    expect(e.data.color).toBe(COLORS.success);
    expect(e.data.description).toContain("done");
  });
  it("builds an error embed with the error color", () => {
    const e = errorEmbed("nope");
    expect(e.data.color).toBe(COLORS.error);
  });
  it("builds an info embed with a title", () => {
    const e = infoEmbed("Title", "body");
    expect(e.data.title).toBe("Title");
    expect(e.data.color).toBe(COLORS.info);
  });
});

describe("branded styling", () => {
  it("success is green with a checkmark and branded footer + timestamp", () => {
    const e = successEmbed("done").toJSON();
    expect(e.color).toBe(COLORS.success);
    expect(e.footer.text).toBe("Joint Jagadeesan");
    expect(e.timestamp).toBeTruthy();
  });
  it("warn stays amber", () => {
    expect(warnEmbed("hmm").toJSON().color).toBe(COLORS.warn);
  });
  it("brandEmbed builds a green panel with fields + thumbnail; panelEmbed is an alias", () => {
    const e = brandEmbed({
      title: "Panel",
      description: "desc",
      fields: [{ name: "A", value: "1" }],
      thumbnail: "https://x/y.png",
    }).toJSON();
    expect(e.color).toBe(COLORS.brand);
    expect(e.title).toBe("Panel");
    expect(e.fields[0]).toMatchObject({ name: "A", value: "1" });
    expect(e.thumbnail.url).toBe("https://x/y.png");
    expect(panelEmbed).toBe(brandEmbed);
  });
});
