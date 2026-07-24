// src/modules/automod/rules/packs/grabbers.js
export default {
  id: "grabbers",
  version: 1,
  title: "IP grabbers & loggers",
  description: "grabify / iplogger and similar tracking links.",
  rules: [
    {
      pattern: "(grabify|iplogger|ipgrab|blasze|ezstat)",
      target: "any",
      weight: 80,
      deleteOnHit: true,
      native: {
        keywordFilter: ["grabify.link*", "iplogger.org*", "iplogger.com*", "2no.co*", "yip.su*"],
      },
    },
  ],
};
