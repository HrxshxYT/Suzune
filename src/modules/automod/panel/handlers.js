// Dispatches an automod panel component click: persists via ctx.config.updateAutomod
// and mirrors the change into the in-memory panel state. Returns a runPanel directive.
export async function handleAutomodComponent(i, state, ctx) {
  const parts = i.customId.split(":"); // am:<kind>[:<arg>]:<ownerId>
  const kind = parts[1];

  if (kind === "close") return "close";

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
