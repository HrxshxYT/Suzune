import { describe, it, expect } from "vitest";
import { extract } from "../../../src/modules/automod/pipeline/extract.js";

const fakeMessage = (over = {}) => ({
  content: "check https://discord.gift/free and bit.ly/x",
  embeds: [{ title: "Free Nitro", description: "click here", fields: [], footer: null, author: null }],
  attachments: new Map([["1", { name: "invoice.exe" }]]),
  stickers: new Map([["2", { name: "wave" }]]),
  author: { username: "scammer" },
  ...over,
});

describe("extract", () => {
  it("combines all text surfaces", () => {
    const { text } = extract(fakeMessage(), { displayName: "Nitro Giver" });
    expect(text).toContain("Free Nitro");
    expect(text).toContain("invoice.exe");
    expect(text).toContain("wave");
    expect(text).toContain("Nitro Giver");
  });
  it("parses full URLs structurally", () => {
    const { urls } = extract(fakeMessage(), null);
    expect(urls.some((u) => u.hostname === "discord.gift")).toBe(true);
  });
  it("parses bare domains via https retry", () => {
    const { urls } = extract(fakeMessage(), null);
    expect(urls.some((u) => u.hostname === "bit.ly")).toBe(true);
  });
  it("discards non-URL tokens", () => {
    const { urls } = extract({ ...fakeMessage(), content: "just words here" }, null);
    expect(urls).toEqual([]);
  });
});
