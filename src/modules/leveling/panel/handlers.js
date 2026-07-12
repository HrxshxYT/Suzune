import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";

async function openXpModal(i, state, ctx, render) {
  const a = state.leveling;
  const modalId = `lv:xpmodal:${i.user.id}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("XP settings");
  const field = (id, label, value) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setValue(String(value)).setRequired(true),
    );
  modal.addComponents(
    field("xpMin", "Min XP per message", a.xpMin ?? 15),
    field("xpMax", "Max XP per message", a.xpMax ?? 25),
    field("cooldownSec", "Cooldown seconds", a.cooldownSec ?? 60),
  );
  await i.showModal(modal);

  let sub;
  try {
    sub = await i.awaitModalSubmit({ time: 120000, filter: (m) => m.customId === modalId && m.user.id === i.user.id });
  } catch {
    return "handled";
  }

  const xpMin = Number(sub.fields.getTextInputValue("xpMin"));
  const xpMax = Number(sub.fields.getTextInputValue("xpMax"));
  const cooldownSec = Number(sub.fields.getTextInputValue("cooldownSec"));
  if (![xpMin, xpMax, cooldownSec].every((n) => Number.isInteger(n) && n >= 0) || xpMin > xpMax) {
    await sub.reply({ embeds: [errorEmbed("Min/Max/Cooldown must be whole numbers and Min ≤ Max.")], ephemeral: true });
    return "handled";
  }

  await ctx.config.updateLeveling(state.guildId, { xpMin, xpMax, cooldownSec });
  Object.assign(state.leveling, { xpMin, xpMax, cooldownSec });
  await sub.update(render());
  return "handled";
}

export async function handleLevelingComponent(i, state, ctx, render) {
  const parts = i.customId.split(":"); // lv:<kind>:<arg?>:<owner>
  const kind = parts[1];

  if (kind === "close") return "close";
  if (kind === "rewards") { state.view = "rewards"; return "update"; }
  if (kind === "back") { state.view = "main"; state.pendingRoleId = null; return "update"; }
  if (kind === "xp") return openXpModal(i, state, ctx, render);

  if (kind === "tog") {
    const field = parts[2];
    const next = !state.leveling[field];
    await ctx.config.updateLeveling(state.guildId, { [field]: next });
    state.leveling[field] = next;
    return "update";
  }

  if (kind === "ign") {
    const which = parts[2]; // channels | roles
    const field = which === "channels" ? "ignoredChannels" : "ignoredRoles";
    const values = i.values ?? [];
    await ctx.config.updateLeveling(state.guildId, { [field]: values });
    state.leveling[field] = values;
    return "update";
  }

  if (kind === "rw") {
    const arg = parts[2]; // role | level | remove
    if (arg === "role") {
      state.pendingRoleId = i.values[0];
      return "update";
    }
    if (arg === "level") {
      if (!state.pendingRoleId) return "update";
      const level = Number(i.values[0]);
      await ctx.leveling.addReward(state.guildId, level, state.pendingRoleId);
      state.pendingRoleId = null;
      state.rewards = await ctx.leveling.getRewards(state.guildId);
      return "update";
    }
    if (arg === "remove") {
      const level = Number(i.values[0]);
      await ctx.leveling.removeReward(state.guildId, level);
      state.rewards = await ctx.leveling.getRewards(state.guildId);
      return "update";
    }
  }

  return "update";
}
