// src/modules/automod/rules/packs/index.js
import core from "./core.js";
import nitro from "./nitro.js";
import steam from "./steam.js";
import crypto from "./crypto.js";
import grabbers from "./grabbers.js";
import raid from "./raid.js";

export const PACKS = [core, nitro, steam, crypto, grabbers, raid];
export const packById = new Map(PACKS.map((p) => [p.id, p]));

export function getPack(id) {
  return packById.get(id);
}

// A pack update is available when the guild installed an older version.
export function updateAvailable(packState, pack) {
  return (packState?.installedVersion ?? 0) < pack.version;
}
