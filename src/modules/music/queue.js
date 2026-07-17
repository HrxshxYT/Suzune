import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { formatDuration } from "./format.js";

// Total remaining time across all upcoming tracks (streams count as 0).
function totalDuration(tracks) {
  return tracks.reduce((sum, t) => sum + (t.info?.isStream ? 0 : t.info?.duration ?? 0), 0);
}

// A paged queue embed: the current track plus a window of upcoming tracks.
export function buildQueueEmbed({ player, page = 0, pageSize = 10 }) {
  const current = player?.queue?.current;
  const tracks = player?.queue?.tracks ?? [];
  const pageCount = Math.max(1, Math.ceil(tracks.length / pageSize));
  const p = Math.max(0, Math.min(pageCount - 1, page));
  const start = p * pageSize;
  const slice = tracks.slice(start, start + pageSize);

  const upcoming = slice.length
    ? slice
        .map((t, i) => `\`${start + i + 1}.\` [${t.info.title}](${t.info.uri ?? ""}) \`${formatDuration(t.info.duration, { live: t.info.isStream })}\``)
        .join("\n")
    : "_The queue is empty — add more with_ `/play`.";

  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle("📋 Queue")
    .setDescription(upcoming)
    .setFooter({
      text: `Page ${p + 1}/${pageCount} · ${tracks.length} in queue · ${formatDuration(totalDuration(tracks))} left`,
    });

  if (current) {
    embed.addFields({
      name: "Now playing",
      value: `[${current.info.title}](${current.info.uri ?? ""}) \`${formatDuration(current.info.duration, { live: current.info.isStream })}\``,
    });
  }
  return embed;
}
