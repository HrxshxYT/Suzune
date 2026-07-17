// Discord API error conditions that mean a dashboard message is gone for good
// (deleted, channel removed, access revoked) — the loop should stop and the
// persisted row should be cleaned up. Anything else (5xx, rate limits, network
// blips) is transient: keep the loop alive and try again next tick.
const GONE_CODES = new Set([
  10003, // Unknown Channel
  10004, // Unknown Guild
  10008, // Unknown Message
  50001, // Missing Access
  50013, // Missing Permissions
]);

function isGone(err) {
  const status = err?.status ?? err?.httpStatus;
  return GONE_CODES.has(err?.code) || status === 403 || status === 404;
}

// Drives the live dashboards: on a fixed interval it rebuilds a message's
// payload and edits it in place. A loop runs until the message is deleted (or
// the bot can no longer edit it); transient failures are retried, never fatal.
// Persistence (so loops survive restarts) is handled by the caller via the
// `prisma.dashboard` table; this service removes a row when its message is gone.
export class DashboardService {
  constructor({ logger, prisma, refreshMs = 90_000 } = {}) {
    this.logger = logger;
    this.prisma = prisma;
    this.refreshMs = refreshMs;
    this.loops = new Map(); // messageId -> timer
  }

  // `build` is an async function returning an edit payload (e.g. { embeds }).
  // Only one loop runs per message; starting a new one replaces the old.
  start(message, build) {
    const key = message.id;
    this.stop(key);

    const tick = async () => {
      let payload;
      try {
        payload = await build();
      } catch (err) {
        // A render hiccup (e.g. a webhook fetch 5xx) shouldn't end the loop.
        this.logger?.warn?.({ err, messageId: key }, "dashboard render failed; will retry");
        return;
      }
      try {
        await message.edit(payload);
      } catch (err) {
        if (isGone(err)) {
          this.logger?.info?.({ messageId: key }, "dashboard message gone; stopping loop");
          await this.forget(key);
        } else {
          this.logger?.warn?.({ err, messageId: key }, "dashboard edit failed; will retry");
        }
      }
    };

    const timer = setInterval(tick, this.refreshMs);
    timer.unref?.();
    this.loops.set(key, timer);
    return key;
  }

  stop(key) {
    const timer = this.loops.get(key);
    if (timer) {
      clearInterval(timer);
      this.loops.delete(key);
    }
  }

  // Stop the loop and drop its persisted row so it isn't restored next boot.
  async forget(key) {
    this.stop(key);
    try {
      await this.prisma?.dashboard?.deleteMany?.({ where: { id: key } });
    } catch (err) {
      this.logger?.warn?.({ err, messageId: key }, "failed to delete dashboard row");
    }
  }

  stopAll() {
    for (const key of [...this.loops.keys()]) this.stop(key);
  }

  get activeCount() {
    return this.loops.size;
  }
}
