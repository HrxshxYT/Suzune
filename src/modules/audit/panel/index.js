import { runPanel } from "../../../lib/panel.js";
import { buildAuditView } from "./render.js";
import { handleAuditComponent } from "./handlers.js";

export async function runAuditPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    audit: { ...(gc.audit ?? { events: {} }) },
  };
  const render = () => buildAuditView(state.audit, state.ownerId);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i) => handleAuditComponent(i, state, ctx),
    awaitFn: ctx.awaitFn,
  });
}
