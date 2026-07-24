import { describe, it, expect } from "vitest";
import { FeedLoader } from "../../../src/modules/automod/feed/loader.js";
import { SNAPSHOT } from "../../../src/modules/automod/feed/snapshot.js";

describe("FeedLoader", () => {
  it("starts from the vendored snapshot", () => {
    const l = new FeedLoader({ feedUrl: null, logger: { warn() {}, info() {} } });
    expect(l.getBlocklist().has(SNAPSHOT[0])).toBe(true);
  });
  it("refresh merges fetched domains", async () => {
    const l = new FeedLoader({ feedUrl: "https://feed.example/list", logger: { warn() {}, info() {} } });
    const fakeFetch = async () => ({ ok: true, text: async () => "new-scam.example\nother.example\n# comment" });
    const res = await l.refresh(fakeFetch);
    expect(res.ok).toBe(true);
    expect(l.getBlocklist().has("new-scam.example")).toBe(true);
  });
  it("refresh failure keeps the previous list", async () => {
    const l = new FeedLoader({ feedUrl: "https://feed.example/list", logger: { warn() {}, info() {} } });
    const before = l.getBlocklist().size;
    const res = await l.refresh(async () => { throw new Error("network"); });
    expect(res.ok).toBe(false);
    expect(l.getBlocklist().size).toBe(before);
  });
  it("no feedUrl → refresh is a no-op returning snapshot source", async () => {
    const l = new FeedLoader({ feedUrl: null, logger: { warn() {}, info() {} } });
    const res = await l.refresh(async () => { throw new Error("should not be called"); });
    expect(res.source).toBe("snapshot");
  });
});
