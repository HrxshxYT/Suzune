export const STATUS_DEBOUNCE_MS = 45000;

// The channel-status badge text. memberCount is the guild's total member count
// (includes bots), matching "all members of the server".
export function formatGuardStatus(memberCount) {
  return `🛡️ Guarding ${memberCount} members`;
}

// A per-key trailing debouncer: rapid schedule() calls for the same key collapse
// into a single deferred invocation. Used to keep member join/leave storms from
// hammering the voice-status API.
export function createDebouncer(waitMs = STATUS_DEBOUNCE_MS) {
  const timers = new Map();
  return {
    schedule(key, fn) {
      clearTimeout(timers.get(key));
      const t = setTimeout(() => {
        timers.delete(key);
        fn();
      }, waitMs);
      t.unref?.();
      timers.set(key, t);
    },
    cancel(key) {
      clearTimeout(timers.get(key));
      timers.delete(key);
    },
    cancelAll() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
