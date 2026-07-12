import { Events } from "discord.js";
import { startPresenceRotation } from "../presence.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(ctx, client) {
    startPresenceRotation(client, { logger: ctx.logger });
    ctx.logger.info?.("presence rotation started");
  },
};
