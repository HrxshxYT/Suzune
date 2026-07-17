import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { formatDuration, progressBar } from "./format.js";

const LOOP_LABEL = { off: "Off", track: "Track", queue: "Queue" };

function requesterMention(requester) {
  if (!requester) return "—";
  if (typeof requester === "string") return requester;
  return requester.id ? `<@${requester.id}>` : (requester.username ?? "—");
}

function controlRows({ paused, repeatMode, queueLength }) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music:pause")
      .setEmoji(paused ? "▶️" : "⏸️")
      .setLabel(paused ? "Resume" : "Pause")
      .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music:skip").setEmoji("⏭️").setLabel("Skip").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music:stop").setEmoji("⏹️").setLabel("Stop").setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("music:loop")
      .setEmoji("🔁")
      .setLabel(`Loop: ${LOOP_LABEL[repeatMode] ?? "Off"}`)
      .setStyle(repeatMode && repeatMode !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music:shuffle")
      .setEmoji("🔀")
      .setLabel("Shuffle")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(queueLength < 2),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("music:queue").setEmoji("📋").setLabel("Queue").setStyle(ButtonStyle.Primary),
  );
  return [row1, row2];
}

// Builds the Now-Playing message payload (rich purple embed + control buttons) for
// the current track. `track` defaults to the player's current track.
export function buildNowPlaying({ player, track = player?.queue?.current }) {
  const info = track?.info ?? {};
  const queueTracks = player?.queue?.tracks ?? [];
  const filter = player?.get?.("filter") ?? "none";
  const upNext = queueTracks[0]?.info?.title ?? "—";

  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(info.title ?? "Unknown track")
    .setDescription(
      progressBar(player?.position ?? 0, info.duration ?? 0, 14, { live: info.isStream }),
    )
    .addFields(
      { name: "Requested by", value: requesterMention(track?.requester), inline: true },
      { name: "Volume", value: `${player?.volume ?? 100}%`, inline: true },
      { name: "Loop", value: LOOP_LABEL[player?.repeatMode] ?? "Off", inline: true },
      { name: "Filter", value: String(filter), inline: true },
      { name: "Duration", value: formatDuration(info.duration ?? 0, { live: info.isStream }), inline: true },
      { name: "In queue", value: String(queueTracks.length), inline: true },
      { name: "Up next", value: upNext.slice(0, 256) },
    )
    .setFooter({ text: "Developed by hrxshxforpresident" })
    .setTimestamp();

  if (info.uri) embed.setURL(info.uri);
  if (info.author) embed.setAuthor({ name: info.author.slice(0, 256) });
  if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);

  return {
    embeds: [embed],
    components: controlRows({
      paused: Boolean(player?.paused),
      repeatMode: player?.repeatMode ?? "off",
      queueLength: queueTracks.length,
    }),
  };
}
