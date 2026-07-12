import { runPanel } from "../../../lib/panel.js";
import { buildMainView, buildRewardsView } from "./render.js";
import { handleLevelingComponent } from "./handlers.js";

const VIEWS = { main: buildMainView, rewards: buildRewardsView };

export async function runLevelingPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const rewards = await ctx.leveling.getRewards(guildId);
  const defaults = { enabled: false, announce: true, xpMin: 15, xpMax: 25, cooldownSec: 60, ignoredChannels: [], ignoredRoles: [] };
  const state = {
    guildId,
    ownerId: interaction.user.id,
    view: "main",
    leveling: { ...defaults, ...(gc.leveling ?? {}) },
    rewards,
    pendingRoleId: null,
  };
  const render = () => (VIEWS[state.view] ?? buildMainView)(state);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleLevelingComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
