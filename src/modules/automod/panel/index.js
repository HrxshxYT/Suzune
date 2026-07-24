import { runPanel } from "../../../lib/panel.js";
import { buildAutomodView } from "./render.js";
import { buildNativeView } from "../native/view.js";
import { handleAutomodComponent } from "./handlers.js";

export async function runAutomodPanel(interaction, ctx, initialView) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    // "packs" and "exempt" both open on the main view (the relevant row is
    // visible there); only "native" is a distinct sub-view.
    view: initialView === "native" ? "native" : "main", // "main" | "native"
    automod: { ...(gc.automod ?? {}) },
    packStates: await ctx.config.getPackStates(guildId),
    lastSync: null,
  };
  const render = () =>
    state.view === "native"
      ? buildNativeView(state.automod, state.ownerId, state.lastSync)
      : buildAutomodView(state.automod, state.packStates, state.ownerId);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, render) => handleAutomodComponent(i, state, ctx, render),
    awaitFn: ctx.awaitFn,
  });
}
