import { runPanel } from "../../../lib/panel.js";
import { buildAutomodView } from "./render.js";
import { buildNativeView } from "../native/view.js";
import { handleAutomodComponent } from "./handlers.js";

export async function runAutomodPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    view: "main", // "main" | "native"
    automod: { ...(gc.automod ?? {}) },
    lastSync: null,
  };
  const render = () =>
    state.view === "native"
      ? buildNativeView(state.automod, state.ownerId, state.lastSync)
      : buildAutomodView(state.automod, state.ownerId);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, render) => handleAutomodComponent(i, state, ctx, render),
    awaitFn: ctx.awaitFn,
  });
}
