import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { sameVoiceChannel } from "./guards.js";
import { buildNowPlaying } from "./nowPlaying.js";
import { buildQueueEmbed } from "./queue.js";

const NEXT_LOOP = { off: "track", track: "queue", queue: "off" };

function ephemeral(text) {
  return {
    embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(text)],
    ephemeral: true,
  };
}

// Handles a `music:*` button press on a Now-Playing message. Anyone in the bot's
// voice channel may control playback; the message is re-rendered in place.
export async function handleControl(interaction, ctx) {
  const action = interaction.customId.split(":")[1];
  const player = ctx.music?.getPlayer?.(interaction.guildId);

  if (!player) {
    await interaction.reply(ephemeral("Nothing is playing right now."));
    return;
  }
  if (!sameVoiceChannel(interaction.member, player)) {
    await interaction.reply(ephemeral("Join my voice channel to control playback."));
    return;
  }

  switch (action) {
    case "pause":
      if (player.paused) await player.resume();
      else await player.pause();
      await interaction.update(buildNowPlaying({ player }));
      return;
    case "skip":
      await player.skip(0, false);
      await interaction.update(buildNowPlaying({ player }));
      return;
    case "stop":
      await player.destroy();
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(COLORS.brand).setDescription("⏹️ Stopped and left the channel.")],
        components: [],
      });
      return;
    case "loop":
      await player.setRepeatMode(NEXT_LOOP[player.repeatMode] ?? "track");
      await interaction.update(buildNowPlaying({ player }));
      return;
    case "shuffle":
      await player.queue.shuffle();
      await interaction.update(buildNowPlaying({ player }));
      return;
    case "queue":
      await interaction.reply({ embeds: [buildQueueEmbed({ player })], ephemeral: true });
      return;
    default:
      return;
  }
}
