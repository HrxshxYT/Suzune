// Drives the live dashboards: on a fixed interval it rebuilds a message's
// payload and edits it in place. Loops are bounded (they stop after a maximum
// number of ticks) and self-clean when a message can no longer be edited — a
// deleted message or revoked permissions ends the loop instead of leaking a
// timer.
export class DashboardService {
  constructor({ logger, refreshMs = 5000, maxTicks = 120 } = {}) {
    this.logger = logger;
    this.refreshMs = refreshMs;
    this.maxTicks = maxTicks;
    this.loops = new Map(); // messageId -> timer
  }

  // `build` is an async function returning an edit payload (e.g. { embeds }).
  // Only one loop runs per message; starting a new one replaces the old.
  start(message, build) {
    const key = message.id;
    this.stop(key);

    let ticks = 0;
    const tick = async () => {
      ticks += 1;
      try {
        const payload = await build();
        await message.edit(payload);
      } catch (err) {
        this.logger?.warn?.({ err, messageId: key }, "dashboard refresh failed; stopping");
        this.stop(key);
        return;
      }
      if (ticks >= this.maxTicks) this.stop(key);
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

  stopAll() {
    for (const key of [...this.loops.keys()]) this.stop(key);
  }

  get activeCount() {
    return this.loops.size;
  }
}
