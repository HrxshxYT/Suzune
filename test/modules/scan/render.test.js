import { describe, it, expect } from "vitest";
import { buildScanEmbeds, SCAN_FILENAME } from "../../../src/modules/scan/render.js";
import { buildScanCard } from "../../../src/modules/scan/card.js";

const report = {
  metrics: {
    members: 500, roles: 12, privileged: 4, threatRoles: 1, threatUsers: 2,
    threatAssets: 0, permRisk: 1, integrity: 55,
  },
  findings: [
    { severity: "critical", title: "Anti-Nuke is disabled", detail: "No protection." },
    { severity: "warning", title: "Auto-Moderation is disabled", detail: "No filters." },
    { severity: "info", title: "Low verification level", detail: "Raise it." },
  ],
  counts: { critical: 1, warning: 1, info: 1 },
  score: 55,
  tier: { label: "ELEVATED", color: 0xe67e22 },
  grade: "D",
  brokenRoles: 0,
  recommendations: [
    { label: "Enable Anti-Nuke protection", command: "/antinuke enable" },
    { label: "All good", command: "" },
  ],
};

describe("buildScanEmbeds", () => {
  it("summarises grade, findings and recommendations, hosting the card", () => {
    const [embed] = buildScanEmbeds(report, { guildName: "My Server" });
    const json = JSON.stringify(embed.data);
    expect(json).toContain("Grade D");
    expect(json).toContain("My Server");
    expect(json).toContain("Anti-Nuke is disabled");
    expect(json).toContain("/antinuke enable");
    expect(embed.data.image.url).toBe(`attachment://${SCAN_FILENAME}`);
    expect(embed.data.footer.text).toBe("Developed by hrxshxforpresident");
    expect(embed.data.color).toBe(0xe67e22);
  });

  it("shows a clean message when there are no findings", () => {
    const [embed] = buildScanEmbeds({ ...report, findings: [], counts: { critical: 0, warning: 0, info: 0 } });
    expect(JSON.stringify(embed.data)).toContain("No security issues detected");
  });
});

describe("buildScanCard", () => {
  it("renders a non-empty PNG buffer", () => {
    const buf = buildScanCard({ report, guildName: "My Server" });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  });

  it("renders with zero findings without throwing", () => {
    const buf = buildScanCard({
      report: { ...report, findings: [], counts: { critical: 0, warning: 0, info: 0 }, grade: "A+", score: 100, tier: { label: "PROTECTED", color: 0 } },
      guildName: "Clean",
    });
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
