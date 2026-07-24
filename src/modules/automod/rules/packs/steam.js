// src/modules/automod/rules/packs/steam.js
export default {
  id: "steam",
  version: 1,
  title: "Steam gift scams",
  description: "Fake Steam gift / trade offers.",
  rules: [
    {
      pattern: "free\\s*steam\\s*(gift|game|key)",
      target: "any",
      weight: 55,
      deleteOnHit: true,
      native: { keywordFilter: ["*free steam gift*", "*steam gift card*"] },
    },
    { pattern: "steamcommunity\\s*(gift|trade|nitro|award)", target: "any", weight: 55, deleteOnHit: true },
  ],
};
