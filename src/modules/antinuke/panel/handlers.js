import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { getWhitelistLimit } from "../config.js";

// Merges a patch into one action's whitelist-limit config and persists it.
async function patchWhitelistLimit(state, ctx, actionKey, patch) {
  const merged = { ...getWhitelistLimit(state.antinuke, actionKey), ...patch };
  const whitelistLimits = { ...(state.antinuke.whitelistLimits ?? {}), [actionKey]: merged };
  await ctx.config.updateAntinuke(state.guildId, { whitelistLimits });
  state.antinuke.whitelistLimits = whitelistLimits;
}

async function handleWhitelistLimits(i, state, ctx, arg) {
  if (arg === "open") {
    state.view = "wllimits";
    return "update";
  }
  if (arg === "back") {
    state.view = "main";
    state.wlAction = null;
    return "update";
  }
  if (arg === "toggle") {
    const next = !state.antinuke.whitelistLimitEnabled;
    await ctx.config.updateAntinuke(state.guildId, { whitelistLimitEnabled: next });
    state.antinuke.whitelistLimitEnabled = next;
    return "update";
  }
  if (arg === "pick") {
    state.wlAction = i.values[0];
    return "update";
  }
  if (!state.wlAction) return "update";
  if (arg === "limit") {
    await patchWhitelistLimit(state, ctx, state.wlAction, { limit: Number(i.values[0]) });
    return "update";
  }
  if (arg === "window") {
    await patchWhitelistLimit(state, ctx, state.wlAction, { windowSec: Number(i.values[0]) });
    return "update";
  }
  if (arg === "actog") {
    const current = getWhitelistLimit(state.antinuke, state.wlAction);
    await patchWhitelistLimit(state, ctx, state.wlAction, { enabled: !current.enabled });
    return "update";
  }
  return "update";
}

async function openAdvancedModal(i, state, ctx, render) {
  const a = state.antinuke;
  const modalId = `an:advmodal:${i.user.id}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Anti-raid settings");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("raidJoinCount")
        .setLabel("Raid join count (joins to trigger)")
        .setStyle(TextInputStyle.Short)
        .setValue(String(a.raidJoinCount ?? 10))
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("raidWindowSec")
        .setLabel("Raid window (seconds)")
        .setStyle(TextInputStyle.Short)
        .setValue(String(a.raidWindowSec ?? 10))
        .setRequired(true),
    ),
  );

  await i.showModal(modal);

  let sub;
  try {
    sub = await i.awaitModalSubmit({
      time: 120000,
      filter: (m) => m.customId === modalId && m.user.id === i.user.id,
    });
  } catch {
    return "handled"; // modal timed out / dismissed
  }

  const count = Number(sub.fields.getTextInputValue("raidJoinCount"));
  const win = Number(sub.fields.getTextInputValue("raidWindowSec"));
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(win) || win < 1) {
    await sub.reply({
      embeds: [errorEmbed("Both values must be positive whole numbers.")],
      ephemeral: true,
    });
    return "handled";
  }

  await ctx.config.updateAntinuke(state.guildId, { raidJoinCount: count, raidWindowSec: win });
  state.antinuke.raidJoinCount = count;
  state.antinuke.raidWindowSec = win;
  await sub.update(render());
  return "handled";
}

export async function handleAntinukeComponent(i, state, ctx, render) {
  const [, kind, arg] = i.customId.split(":");

  if (kind === "close") return "close";

  if (kind === "tog") {
    const next = !state.antinuke[arg];
    await ctx.config.updateAntinuke(state.guildId, { [arg]: next });
    state.antinuke[arg] = next;
    return "update";
  }

  if (kind === "sel") {
    const value = i.values[0];
    const field =
      arg === "punishment" ? "punishment" : arg === "alert" ? "alertChannelId" : "quarantineRoleId";
    await ctx.config.updateAntinuke(state.guildId, { [field]: value });
    state.antinuke[field] = value;
    return "update";
  }

  if (kind === "adv") {
    return openAdvancedModal(i, state, ctx, render);
  }

  if (kind === "wll") {
    return handleWhitelistLimits(i, state, ctx, arg);
  }

  if (kind === "wl") {
    if (arg === "open") {
      state.view = "whitelist";
      return "update";
    }
    if (arg === "back") {
      state.view = "main";
      return "update";
    }
    if (arg === "add" || arg === "remove") {
      if (i.user.id !== state.serverOwnerId) {
        await i.reply({
          embeds: [errorEmbed("Only the server owner can change the anti-nuke whitelist.")],
          ephemeral: true,
        });
        return "handled";
      }
    }
    if (arg === "add") {
      const targetId = i.values[0];
      const type = i.roles?.has?.(targetId) ? "role" : "user";
      await ctx.config.addWhitelist(state.guildId, targetId, type, i.user.id);
      state.whitelist = [
        ...state.whitelist.filter((e) => e.targetId !== targetId),
        { targetId, type },
      ];
      return "update";
    }
    if (arg === "remove") {
      const targetId = i.values[0];
      await ctx.config.removeWhitelist(state.guildId, targetId);
      state.whitelist = state.whitelist.filter((e) => e.targetId !== targetId);
      return "update";
    }
  }

  return "update";
}
