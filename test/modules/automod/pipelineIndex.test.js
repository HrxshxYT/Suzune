// test/modules/automod/pipelineIndex.test.js
import { describe, it, expect, vi } from "vitest";
import RE2 from "re2";
import { runPipeline } from "../../../src/modules/automod/pipeline/index.js";
import { HeatService } from "../../../src/core/HeatService.js";

describe("runPipeline", () => {
  it("runs all stages and deletes on a matching scam", async () => {
    const message = {
      content: "free nitro at discord.gift/x",
      embeds: [], attachments: new Map(), stickers: new Map(),
      author: { username: "u" }, guild: { id: "g", name: "S" },
      client: { user: { id: "bot" } }, delete: vi.fn().mockResolvedValue(),
    };
    const member = { id: "u", displayName: "u", timeout: vi.fn().mockResolvedValue(), user: { id: "u" }, roles: { cache: new Map() }, permissions: { has: () => false } };
    const compiledRules = [{ id: "p", source: "nitro", target: "normalized", weight: 60, deleteOnHit: true, dryRun: false, re: new RE2("free\\s*nitro", "i") }];
    const r = await runPipeline({
      message, member, config: { heatThreshold: 100, heatDecaySec: 60, thresholdAction: "timeout", timeoutSeconds: 300, exemptRoles: [], exemptChannels: [] },
      guildConfig: { dmOnAction: false }, compiledRules, heat: new HeatService(() => 0),
      blocklist: new Set(), shorteners: new Set(), cases: { createCase: vi.fn() }, logger: { error() {}, warn() {} },
    });
    expect(message.delete).toHaveBeenCalled();
    expect(r.hits.length).toBeGreaterThan(0);
  });
});
