import { ActivityType } from "discord.js";

// Statuses the bot cycles through. Custom activities render the raw text with
// no "Playing"/"Watching" prefix, so what you see is exactly the name.
export const PRESENCE_STATUSES = [
  { name: "/help", type: ActivityType.Custom },
  { name: "High on Joint", type: ActivityType.Custom },
  { name: "By hrxshxforpresident", type: ActivityType.Custom },

];

export const PRESENCE_INTERVAL_MS = 10000;

// Rotates the client presence through PRESENCE_STATUSES, applying the first one
// immediately and then advancing on each interval tick. Returns the timer so
// callers (and tests) can stop it.
export function startPresenceRotation(client, { intervalMs = PRESENCE_INTERVAL_MS, logger } = {}) {
  let index = 0;

  const apply = () => {
    const status = PRESENCE_STATUSES[index % PRESENCE_STATUSES.length];
    index += 1;
    try {
      client.user?.setPresence({
        status: "online",
        activities: [{ name: status.name, type: status.type }],
      });
    } catch (err) {
      logger?.error?.({ err }, "presence update failed");
    }
  };

  apply();
  const timer = setInterval(apply, intervalMs);
  // Don't let the rotation keep the process alive on its own.
  timer.unref?.();
  return timer;
}
