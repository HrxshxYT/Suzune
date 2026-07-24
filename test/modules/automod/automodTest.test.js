// test/modules/automod/automodTest.test.js
import { describe, it, expect, vi } from "vitest";
import { handleTest } from "../../../src/modules/automod/commands/test.js";

const interaction = (pattern, sample) => ({
  options: { getString: (k) => (k === "pattern" ? pattern : sample) },
  reply: vi.fn(),
});

describe("/automod test", () => {
  it("reports a match on the stripped variant for spaced text", async () => {
    const i = interaction("discordgift", "d i s c o r d g i f t");
    await handleTest(i, {});
    const arg = i.reply.mock.calls[0][0];
    expect(JSON.stringify(arg)).toMatch(/stripped/);
  });
  it("reports no match", async () => {
    const i = interaction("nitro", "hello world");
    await handleTest(i, {});
    const arg = i.reply.mock.calls[0][0];
    expect(JSON.stringify(arg)).toMatch(/no match/i);
  });
  it("reports an invalid pattern", async () => {
    const i = interaction("foo(?=bar)", "x");
    await handleTest(i, {});
    const arg = i.reply.mock.calls[0][0];
    expect(JSON.stringify(arg)).toMatch(/invalid/i);
  });
});
