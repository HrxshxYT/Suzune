import { CATEGORIES, isOn } from "../categories.js";

export async function handleAuditComponent(i, state, ctx) {
  const parts = i.customId.split(":"); // au:<kind>[:<arg>]:<ownerId>
  const kind = parts[1];

  if (kind === "close") return "close";

  if (kind === "chan") {
    const channelId = i.values[0];
    await ctx.config.updateAudit(state.guildId, { enabled: true, channelId });
    state.audit.enabled = true;
    state.audit.channelId = channelId;
    return "update";
  }

  if (kind === "disable") {
    await ctx.config.updateAudit(state.guildId, { enabled: false });
    state.audit.enabled = false;
    return "update";
  }

  if (kind === "all") {
    const on = parts[2] === "on";
    const events = {};
    for (const c of CATEGORIES) events[c.key] = on;
    await ctx.config.updateAudit(state.guildId, { events });
    state.audit.events = events;
    return "update";
  }

  if (kind === "cat") {
    const key = parts[2];
    const events = { ...(state.audit.events ?? {}) };
    events[key] = !isOn(state.audit, key);
    await ctx.config.updateAudit(state.guildId, { events });
    state.audit.events = events;
    return "update";
  }

  return "update";
}
