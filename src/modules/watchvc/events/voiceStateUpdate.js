import { Events } from "discord.js";

export default {
  name: Events.VoiceStateUpdate,
  async execute(ctx, oldState, newState) {
    await ctx.watchvc.handleVoiceStateUpdate(oldState, newState);
  },
};
