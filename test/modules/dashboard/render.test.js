import { describe, it, expect } from "vitest";
import { buildDashboardEmbeds, integrityBar } from "../../../src/modules/dashboard/render.js";

const metrics = {
  integrity: 100,
  tier: { label: "PROTECTED", color: 0x2ecc71 },
  firewall: true,
  roles: 15,
  adminRoles: 6,
  threatRoles: 0,
  permRisk: 0,
  channels: 22,
  privileged: 5,
  threatUsers: 0,
  integrations: 5,
  totalAssets: 0,
  threatAssets: 0,
  members: 1234,
  features: { "Anti-Nuke": true, "Anti-Raid": true, "Auto-Mod": false },
};

describe("integrityBar", () => {
  it("fills fully at 100% and empties at 0%", () => {
    expect(integrityBar(100, 10)).toBe("█".repeat(10));
    expect(integrityBar(0, 10)).toBe("░".repeat(10));
    expect(integrityBar(50, 10)).toBe("█████░░░░░");
  });
});

describe("buildDashboardEmbeds", () => {
  it("renders every metric, security toggles and the dev credit footer", () => {
    const [embed] = buildDashboardEmbeds(metrics);
    const json = JSON.stringify(embed.data);
    expect(json).toContain("SECURITY DASHBOARD");
    expect(json).toContain("PROTECTED");
    expect(json).toContain("100%");
    expect(json).toContain("15"); // roles
    expect(json).toContain("22"); // channels
    expect(json).toContain("1234"); // members
    expect(json).toContain("Anti-Nuke");
    expect(json).toContain("Anti-Raid");
    expect(embed.data.footer.text).toBe("Developed by hrxshxforpresident");
    expect(embed.data.color).toBe(0x2ecc71);
  });

  it("shows a clean monitoring core when there are no threats", () => {
    const [embed] = buildDashboardEmbeds(metrics);
    expect(JSON.stringify(embed.data)).toContain("No recent security events detected");
  });

  it("warns when threat metrics are non-zero", () => {
    const [embed] = buildDashboardEmbeds({ ...metrics, threatUsers: 3 });
    expect(JSON.stringify(embed.data)).toContain("Elevated exposure detected");
  });
});
