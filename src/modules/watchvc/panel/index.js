import { runPanel } from "../../../lib/panel.js";
import { buildWatchVcView } from "./render.js";
import { handleWatchVcComponent } from "./handlers.js";

export async function runWatchVcPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    watchVc: {
      channelId: gc.watchVc?.channelId ?? null,
      enabled: gc.watchVc?.enabled ?? false,
    },
  };
  const render = () => buildWatchVcView(state);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleWatchVcComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
