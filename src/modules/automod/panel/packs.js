import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { PACKS, getPack, updateAvailable } from "../rules/packs/index.js";

// Summarizes each known rule pack against the guild's persisted pack states,
// for both rendering the select menu and any future status readouts.
export function packSummary(packStates) {
  const byId = new Map(packStates.map((p) => [p.packId, p]));
  return PACKS.map((p) => {
    const st = byId.get(p.id);
    return { id: p.id, title: p.title, enabled: Boolean(st?.enabled), updateAvailable: updateAvailable(st, p) };
  });
}

// Multi-select of rule packs; selected = enabled. Options flag "(update)"
// when the guild's installed version is behind the pack's current version.
export function buildPacksRow(packStates, ownerId) {
  const summary = packSummary(packStates);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`am:packs:${ownerId}`)
      .setPlaceholder("Enabled rule packs")
      .setMinValues(0)
      .setMaxValues(PACKS.length)
      .addOptions(
        summary.map((s) => ({
          label: `${s.title}${s.updateAvailable ? " (update)" : ""}`,
          value: s.id,
          default: s.enabled,
        })),
      ),
  );
}

// Persists the selected pack set: enabling a pack stamps installedVersion at
// the pack's current version; disabling leaves installedVersion at the pack's
// current version too (so a later re-enable doesn't spuriously show "update").
export async function handlePacksComponent(i, state, ctx) {
  const selected = new Set(i.values);
  for (const pack of PACKS) {
    const on = selected.has(pack.id);
    await ctx.config.setPackState(state.guildId, pack.id, {
      enabled: on,
      installedVersion: on ? pack.version : getPack(pack.id).version,
    });
  }
  ctx.automodRules.invalidate(state.guildId);
  state.packStates = await ctx.config.getPackStates(state.guildId);
  return "update";
}
