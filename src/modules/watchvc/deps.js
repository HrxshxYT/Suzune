import {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection,
} from "@discordjs/voice";

// Real gateway/REST dependencies for WatchVcService. The connection is joined
// unmuted + undeafened and never plays audio, so the bot sits silently.
export function realDeps(client) {
  return {
    join(channel) {
      return joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfMute: false,
        selfDeaf: false,
      });
    },
    ready(connection, timeoutMs = 15000) {
      return entersState(connection, VoiceConnectionStatus.Ready, timeoutMs);
    },
    destroy(connection) {
      try {
        connection.destroy();
      } catch {
        /* already destroyed */
      }
    },
    onDisconnect(connection, cb) {
      connection.on(VoiceConnectionStatus.Disconnected, cb);
    },
    setStatus(channelId, status) {
      return client.rest.put(`/channels/${channelId}/voice-status`, { body: { status } });
    },
    clearStatus(channelId) {
      return client.rest.put(`/channels/${channelId}/voice-status`, { body: { status: "" } });
    },
    getConnection: getVoiceConnection,
  };
}
