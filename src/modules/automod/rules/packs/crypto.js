// src/modules/automod/rules/packs/crypto.js
export default {
  id: "crypto",
  version: 1,
  title: "Crypto & airdrop scams",
  description: "Airdrop, wallet-drainer, giveaway bait.",
  rules: [
    {
      pattern: "(free|claim)\\s*(bitcoin|btc|eth|crypto)",
      target: "any",
      weight: 50,
      deleteOnHit: true,
      native: { keywordFilter: ["*free crypto*", "*crypto giveaway*", "*claim your airdrop*"] },
    },
    { pattern: "connect\\s*your\\s*wallet", target: "any", weight: 50, deleteOnHit: true },
    { pattern: "air\\s*drop", target: "any", weight: 35, deleteOnHit: false },
  ],
};
