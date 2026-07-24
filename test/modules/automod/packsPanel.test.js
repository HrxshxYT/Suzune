import { describe, it, expect, vi } from "vitest";
import { packSummary } from "../../../src/modules/automod/panel/packs.js";
import { PACKS } from "../../../src/modules/automod/rules/packs/index.js";

describe("packs panel", () => {
  it("summarizes enabled state and update availability", () => {
    const nitro = PACKS.find((p) => p.id === "nitro");
    const rows = packSummary([{ packId: "nitro", enabled: true, installedVersion: nitro.version - 1 }]);
    const line = rows.find((r) => r.id === "nitro");
    expect(line.enabled).toBe(true);
    expect(line.updateAvailable).toBe(true);
  });
});
