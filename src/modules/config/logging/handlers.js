// Dispatches a logging panel component click: persists via ctx.config.updateLogging
// and mirrors the change into the in-memory panel state. Returns a runPanel directive.
export async function handleLoggingComponent(i, state, ctx) {
  const parts = i.customId.split(":"); // lg:<kind>[:...]:<ownerId>
  const kind = parts[1];

  if (kind === "close") return "close";

  // Pick which category the channel/enable/disable controls act on.
  if (kind === "cat") {
    state.selected = i.values[0] ?? null;
    return "update";
  }

  // Nothing else is actionable without a selected category.
  if (!state.selected) return "update";

  // Route (or clear) the selected category's channel.
  if (kind === "chan") {
    const channelId = i.values[0] ?? null;
    await ctx.config.updateLogging(state.guildId, { [state.selected]: channelId });
    state.logging[state.selected] = channelId;
    return "update";
  }

  // Toggle the selected category on/off in the `disabled` list.
  if (kind === "enable" || kind === "disable") {
    const disabled = new Set(state.logging.disabled ?? []);
    if (kind === "disable") disabled.add(state.selected);
    else disabled.delete(state.selected);
    const next = [...disabled];
    await ctx.config.updateLogging(state.guildId, { disabled: next });
    state.logging.disabled = next;
    return "update";
  }

  return "update";
}
