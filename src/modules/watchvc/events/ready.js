import { Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(ctx) {
    await ctx.watchvc.restoreAll();
    ctx.logger.info?.("watchvc guards restored");
  },
};
