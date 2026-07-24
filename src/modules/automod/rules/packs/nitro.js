// src/modules/automod/rules/packs/nitro.js
export default {
  id: "nitro",
  version: 1,
  title: "Nitro scams",
  description: "Free-Nitro and gift-scam bait.",
  rules: [
    {
      pattern: "fre+e?\\s*(discord\\s*)?ni+tro",
      target: "any",
      weight: 60,
      deleteOnHit: true,
      native: { keywordFilter: ["*free nitro*", "*free discord nitro*", "*claim your nitro*"] },
    },
    { pattern: "ni+tro\\s*(for\\s*)?fre+e", target: "any", weight: 60, deleteOnHit: true },
    { pattern: "discord(app)?\\.?gift", target: "any", weight: 50, deleteOnHit: true },
  ],
};
