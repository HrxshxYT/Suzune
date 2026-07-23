import { runPanel } from "../../../lib/panel.js";
import { buildLoggingView } from "./render.js";
import { handleLoggingComponent } from "./handlers.js";

export async function runLoggingPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    logging: { ...(gc.logging ?? {}) },
    selected: null,
  };
  const render = () => buildLoggingView(state.logging, state.ownerId, state.selected);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i) => handleLoggingComponent(i, state, ctx),
    awaitFn: ctx.awaitFn,
  });
}
