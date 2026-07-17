// Voice-channel guards: control is limited to members in the bot's voice channel.

export function memberVoiceChannelId(member) {
  return member?.voice?.channelId ?? null;
}

export function sameVoiceChannel(member, player) {
  const id = memberVoiceChannelId(member);
  return Boolean(id && player?.voiceChannelId && id === player.voiceChannelId);
}
