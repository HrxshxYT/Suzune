import { describe, it, expect } from "vitest";
import { COLORS, EMOJIS, BOT_NAME } from "../../src/lib/constants.js";

describe("theme constants", () => {
  it("is purple-forward but keeps semantic alert colors", () => {
    expect(COLORS.brand).toBe(0x8b5cf6); // violet, matches the glass cards
    expect(COLORS.info).toBe(0x8b5cf6);
    expect(COLORS.success).toBe(0x57f287); // green kept
    expect(COLORS.muted).toBe(0x6d5b9e); // muted violet
    expect(COLORS.error).toBe(0xed4245); // red kept
    expect(COLORS.warn).toBe(0xfee75c); // amber kept
  });
  it("exposes an emoji map and the bot name", () => {
    expect(EMOJIS.success).toBe("✅");
    expect(EMOJIS.on).toBe("🟢");
    expect(EMOJIS.off).toBe("🔴");
    expect(BOT_NAME).toBe("Suzune");
  });
});
