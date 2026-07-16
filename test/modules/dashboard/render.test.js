import { describe, it, expect } from "vitest";
import { buildDashboardEmbeds, integrityBar, CARD_FILENAME } from "../../../src/modules/dashboard/render.js";

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
  it("titles the embed for the server and hosts the card image", () => {
    const [embed] = buildDashboardEmbeds(metrics, { guildName: "Cool Guild" });
    const json = JSON.stringify(embed.data);
    expect(json).toContain("Master Dashboard for Cool Guild");
    expect(json).toContain("PROTECTED");
    expect(json).toContain("100%");
    expect(json).toContain("1234"); // members
    expect(json).toContain("Anti-Nuke");
    expect(json).toContain("Anti-Raid");
    expect(embed.data.image.url).toBe(`attachment://${CARD_FILENAME}`);
    expect(embed.data.footer.text).toBe("Developed by hrxshxforpresident");
    expect(embed.data.color).toBe(0x2ecc71);
  });

  it("falls back to a generic title when no guild name is given", () => {
    const [embed] = buildDashboardEmbeds(metrics);
    expect(embed.data.title).toContain("Master Dashboard for This Server");
  });

  it("shows the shield status from the metrics", () => {
    const [on] = buildDashboardEmbeds(metrics);
    expect(JSON.stringify(on.data)).toContain("**Shield:** Armed");
    const [off] = buildDashboardEmbeds({ ...metrics, firewall: false });
    expect(JSON.stringify(off.data)).toContain("**Shield:** Down");
  });
});
