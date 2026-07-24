// src/modules/automod/rules/packs/raid.js
export default {
  id: "raid",
  version: 1,
  title: "Raid advertising",
  description: "Raid / nuke service advertising.",
  rules: [
    { pattern: "(raid|nuke)\\s*(this\\s*)?server", target: "any", weight: 45, deleteOnHit: true },
    {
      pattern: "(cheap|buy|selling)\\s*(boost|nitro|accounts?|followers)",
      target: "any",
      weight: 30,
      deleteOnHit: false,
      native: { keywordFilter: ["*cheap boost*", "*cheap nitro*", "*selling accounts*"] },
    },
  ],
};
