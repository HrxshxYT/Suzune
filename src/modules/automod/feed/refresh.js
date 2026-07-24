// Schedules a periodic scam-feed refresh via the shared cron scheduler.
// Scheduler API is `every(expression, name, task)` (see src/core/Scheduler.js).
export function registerFeedRefresh(ctx) {
  if (!ctx.automodFeed) return;
  ctx.automodFeed.refresh().catch(() => {}); // initial load at boot
  ctx.scheduler.every("0 */6 * * *", "automod-feed-refresh", () =>
    ctx.automodFeed.refresh().catch(() => {}),
  );
}
