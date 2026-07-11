import { Events } from "discord.js";
import { sendStartupReport } from "../statusReport.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(ctx) {
    // Fire-and-forget: a failed DM must never block startup.
    sendStartupReport(ctx).catch((err) =>
      ctx.logger.error({ err }, "startup status report crashed"),
    );
  },
};
