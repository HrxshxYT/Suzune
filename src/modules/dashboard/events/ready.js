import { Events } from "discord.js";
import { restoreDashboards } from "../live.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(ctx) {
    // Re-attach refresh loops to dashboards created before the last restart.
    await restoreDashboards(ctx).catch((err) =>
      ctx.logger.error({ err }, "dashboard restore crashed"),
    );
  },
};
