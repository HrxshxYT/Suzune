export const MAX_RECONNECT_ATTEMPTS = 5;

// Whether the bot should move itself back to its configured guard channel.
// True only when guarding is enabled, a channel is configured, and the bot is
// not currently sitting in that channel.
export function shouldReturnToPost({ enabled, configuredChannelId, currentChannelId }) {
  if (!enabled || !configuredChannelId) return false;
  return currentChannelId !== configuredChannelId;
}

// Exponential backoff (ms) for reconnect attempts, capped.
export function backoffMs(attempt, { base = 5000, cap = 60000 } = {}) {
  return Math.min(base * 2 ** attempt, cap);
}
