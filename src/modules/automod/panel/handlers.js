import { RULE_KEYS, syncNativeRules, removeNativeRules } from "../native/rules.js";

// Native-AutoMod boolean columns the panel can toggle directly.
const NATIVE_TOGGLES = new Set(["nativeEnabled", "nativeAlert", "nativeTimeout", ...RULE_KEYS]);

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

  if (kind === "tog") {
    const col = parts[2]; // "enabled" or a filter column
    const next = !state.automod[col];
    await ctx.config.updateAutomod(state.guildId, { [col]: next });
    state.automod[col] = next;
    return "update";
  }

  if (kind === "action") {
    const action = i.values[0];
    await ctx.config.updateAutomod(state.guildId, { action });
    state.automod.action = action;
    return "update";
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
