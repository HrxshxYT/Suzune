import { errorEmbed, successEmbed } from "../../../lib/embeds.js";

export async function handleWatchVcComponent(i, state, ctx, _render) {
  const parts = i.customId.split(":"); // wv:<kind>:<owner>
  const kind = parts[1];

  if (kind === "close") return "close";

  if (kind === "ch") {
    const channelId = i.values[0];
    await ctx.config.updateWatchVc(state.guildId, { channelId });
    state.watchVc.channelId = channelId;
    return "update";
  }

  if (kind === "toggle") {
    if (state.watchVc.enabled) {
      await ctx.watchvc.disable(state.guildId);
      state.watchVc.enabled = false;
      return "update";
    }
    const channel = await ctx.client.channels.fetch(state.watchVc.channelId).catch(() => null);
    if (!channel) {
      await i.reply({ ephemeral: true, embeds: [errorEmbed("That channel no longer exists.")] });
      return "handled";
    }
    const res = await ctx.watchvc.enable(channel);
    if (!res.ok) {
      await i.reply({ ephemeral: true, embeds: [errorEmbed(res.error)] });
      return "handled";
    }
    state.watchVc.enabled = true;
    return "update";
  }

  if (kind === "reassert") {
    const res = await ctx.watchvc.reassert(state.guildId);
    await i.reply({
      ephemeral: true,
      embeds: [res.ok ? successEmbed("Re-asserted the guard channel.") : errorEmbed(res.error)],
    });
    return "handled";
  }

  return "update";
}
