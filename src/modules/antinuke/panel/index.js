import { runPanel } from "../../../lib/panel.js";
import { buildMainView, buildWhitelistView, buildWhitelistLimitsView } from "./render.js";
import { handleAntinukeComponent } from "./handlers.js";

const VIEWS = {
  whitelist: buildWhitelistView,
  wllimits: buildWhitelistLimitsView,
  main: buildMainView,
};

export async function runAntinukePanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    guild: interaction.guild,
    ownerId: interaction.user.id,
    serverOwnerId: interaction.guild.ownerId,
    view: "main",
    wlAction: null,
    antinuke: { ...(gc.antinuke ?? {}) },
    whitelist: [...(gc.whitelist ?? [])],
  };
  const render = () => (VIEWS[state.view] ?? buildMainView)(state);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleAntinukeComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
