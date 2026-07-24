// src/modules/automod/rules/packs/core.js
// Built-in pack that replaces the legacy fixed filters (invites/links baseline).
export default {
  id: "core",
  version: 1,
  title: "Core filters",
  description: "Baseline invite/link filters (replaces the legacy fixed filters).",
  rules: [
    {
      pattern: "discord\\.(gg|io|me)/[a-z0-9-]+",
      target: "any",
      weight: 25,
      deleteOnHit: true,
      native: {
        keywordFilter: ["discord.gg/*", "discord.io/*", "discord.me/*"],
        regexPatterns: ["discord\\.(gg|io|me)/[a-z0-9-]+"],
      },
    },
    {
      pattern: "discord(app)?\\.com/invite/[a-z0-9-]+",
      target: "any",
      weight: 25,
      deleteOnHit: true,
      native: { keywordFilter: ["discord.com/invite/*", "discordapp.com/invite/*"] },
    },
  ],
};
