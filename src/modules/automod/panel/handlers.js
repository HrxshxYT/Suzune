import { RULE_KEYS, syncNativeRules, removeNativeRules } from "../native/rules.js";
import { handlePacksComponent } from "./packs.js";

// Native-AutoMod boolean columns toggled by the button controls (the per-rule
// toggles live in the `nrules` multi-select instead).
const NATIVE_TOGGLES = new Set(["nativeEnabled", "nativeAlert", "nativeTimeout"]);

// Dispatches an automod panel component click: persists via ctx.config.updateAutomod
// and mirrors the change into the in-memory panel state. Returns a runPanel directive.
export async function handleAutomodComponent(i, state, ctx, render) {
  const parts = i.customId.split(":"); // am:<kind>[:<arg>]:<ownerId>
  const kind = parts[1];

  if (kind === "close") return "close";

  // Switch between the main filters view and the native AutoMod view.
  if (kind === "nav") {
    state.view = parts[2] === "native" ? "native" : "main";
    return "update";
  }

  // Toggle a native-AutoMod boolean column.
  if (kind === "ntog") {
    const col = parts[2];
    if (NATIVE_TOGGLES.has(col)) {
      const next = !state.automod[col];
      await ctx.config.updateAutomod(state.guildId, { [col]: next });
      state.automod[col] = next;
    }
    return "update";
  }

  // Which native rules are enabled (multi-select; selected = on).
  if (kind === "nrules") {
    const selected = new Set(i.values);
    const patch = {};
    for (const key of RULE_KEYS) {
      const on = selected.has(key);
      if (Boolean(state.automod[key]) !== on) {
        patch[key] = on;
        state.automod[key] = on;
      }
    }
    if (Object.keys(patch).length) await ctx.config.updateAutomod(state.guildId, patch);
    return "update";
  }

  // Native timeout duration (seconds).
  if (kind === "ntimeout") {
    const seconds = Number(i.values[0]);
    await ctx.config.updateAutomod(state.guildId, { nativeTimeoutSeconds: seconds });
    state.automod.nativeTimeoutSeconds = seconds;
    return "update";
  }

  // Native alert channel (0 or 1 selected).
  if (kind === "nalertch") {
    const channelId = i.values[0] ?? null;
    await ctx.config.updateAutomod(state.guildId, { nativeAlertChannelId: channelId });
    state.automod.nativeAlertChannelId = channelId;
    return "update";
  }

  // Provision the native rules on Discord. Pressing Sync implies "turn this on
  // and apply", so we enable native AutoMod first, then reconcile.
  if (kind === "nsync") {
    await i.deferUpdate();
    if (!state.automod.nativeEnabled) {
      await ctx.config.updateAutomod(state.guildId, { nativeEnabled: true });
      state.automod.nativeEnabled = true;
    }
    state.lastSync = await syncNativeRules({
      guild: i.guild,
      automod: state.automod,
      logger: ctx.logger,
    });
    await i.editReply(render()).catch(() => {});
    return "handled";
  }

  // Delete every rule the bot provisioned and switch native AutoMod off.
  if (kind === "nremove") {
    await i.deferUpdate();
    const res = await removeNativeRules({ guild: i.guild, logger: ctx.logger });
    if (res.ok) {
      await ctx.config.updateAutomod(state.guildId, { nativeEnabled: false });
      state.automod.nativeEnabled = false;
    }
    state.lastSync = res;
    await i.editReply(render()).catch(() => {});
    return "handled";
  }

  // Only the enable toggle lives on the main view now (the six filter
  // toggles were replaced by packs).
  if (kind === "tog") {
    const col = parts[2]; // "enabled"
    if (col === "enabled") {
      const next = !state.automod.enabled;
      await ctx.config.updateAutomod(state.guildId, { enabled: next });
      state.automod.enabled = next;
    }
    return "update";
  }

  if (kind === "action") {
    const thresholdAction = i.values[0];
    await ctx.config.updateAutomod(state.guildId, { thresholdAction });
    state.automod.thresholdAction = thresholdAction;
    return "update";
  }

  if (kind === "packs") {
    return handlePacksComponent(i, state, ctx);
  }

  if (kind === "exroles") {
    await ctx.config.updateAutomod(state.guildId, { exemptRoles: i.values });
    state.automod.exemptRoles = i.values;
    return "update";
  }

  if (kind === "exchans") {
    await ctx.config.updateAutomod(state.guildId, { exemptChannels: i.values });
    state.automod.exemptChannels = i.values;
    return "update";
  }

  return "update";
}
