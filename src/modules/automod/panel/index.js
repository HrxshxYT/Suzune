import { runPanel } from "../../../lib/panel.js";
import { buildAutomodView } from "./render.js";
import { handleAutomodComponent } from "./handlers.js";

export async function runAutomodPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    automod: { ...(gc.automod ?? {}) },
  };
  const render = () => buildAutomodView(state.automod, state.ownerId);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i) => handleAutomodComponent(i, state, ctx),
    awaitFn: ctx.awaitFn,
  });
}
