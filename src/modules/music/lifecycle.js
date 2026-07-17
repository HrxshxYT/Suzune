import { buildNowPlaying } from "./nowPlaying.js";

// Lavalink event handlers, kept pure via injected `deps` (channel fetch, logger,
// autoplay/leave callbacks) so they're testable without a live node.

// A track began: refresh the Now-Playing message in the player's text channel.
export async function onTrackStart(player, track, deps) {
  const channel = await deps.fetchChannel(player.textChannelId);
  if (!channel) return;

  const previousId = player.get("npMessageId");
  if (previousId) {
    await channel.messages.delete(previousId).catch(() => {});
  }

  try {
    const message = await channel.send(buildNowPlaying({ player, track }));
    player.set("npMessageId", message.id);
  } catch (err) {
    deps.logger?.warn?.({ err }, "failed to post now-playing message");
  }
}

// The queue drained: either autoplay a recommendation or schedule an idle leave.
export async function onQueueEnd(player, deps) {
  if (player.get("autoplay")) {
    await deps.autoplay(player);
    return;
  }
  deps.scheduleLeave(player);
}

// A track errored or got stuck: log it and move on so playback doesn't wedge.
export async function onTrackError(player, track, deps) {
  deps.logger?.error?.({ track: track?.info?.title }, "track error — skipping");
  await Promise.resolve(player.skip(0, false)).catch(() => {});
}
