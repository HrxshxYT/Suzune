import { EmbedBuilder } from "discord.js";
import { COLORS, BOT_NAME, LIMITS } from "../../lib/constants.js";

// The user who receives a status report every time the bot starts up.
export const STARTUP_DM_USER_ID = "607412964328210441";

// Total guild count across the whole shard fleet. When sharded we ask every
// shard for its cache size and sum; standalone we just read the local cache.
export async function countGuilds(client) {
  if (client.shard) {
    try {
      const perShard = await client.shard.fetchClientValues("guilds.cache.size");
      return perShard.reduce((sum, n) => sum + (n ?? 0), 0);
    } catch {
      // A sibling shard may not be ready yet — fall back to what we can see.
      return client.guilds.cache.size;
    }
  }
  return client.guilds.cache.size;
}

export async function collectStatus({ client, commands, stats }) {
  const names = [...commands.keys()].sort();
  return {
    ping: client.ws.ping,
    commandCount: names.length,
    commandNames: names,
    guildCount: await countGuilds(client),
    antinukeTriggers: await stats.getAntinukeTriggers(),
  };
}

function commandsValue(names) {
  if (!names.length) return "None loaded";
  const list = names.map((n) => `\`/${n}\``).join(", ");
  if (list.length <= LIMITS.embedFieldValue) return list;
  return `${list.slice(0, LIMITS.embedFieldValue - 1)}…`;
}

export function buildStartupEmbed({ ping, commandCount, commandNames, guildCount, antinukeTriggers }) {
  // ws.ping is -1 until the first heartbeat lands right after "ready".
  const pingText = ping >= 0 ? `\`${Math.round(ping)}ms\`` : "`measuring…`";
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("🟢 Bot Online")
    .setDescription(`${BOT_NAME} has started and is ready.`)
    .addFields(
      { name: "📡 Ping", value: pingText, inline: true },
      { name: "🌐 Servers", value: `\`${guildCount}\``, inline: true },
      { name: "🛡️ Anti-nukes triggered", value: `\`${antinukeTriggers}\``, inline: true },
      {
        name: `✅ Commands functional (${commandCount})`,
        value: commandsValue(commandNames),
      },
    )
    .setTimestamp();
}

// Sends the startup status report as a DM. Only the primary shard (id 0) sends,
// so a sharded fleet doesn't DM the recipient once per shard.
export async function sendStartupReport(ctx) {
  const { client, commands, stats, logger } = ctx;
  if (client.shard && !client.shard.ids.includes(0)) return { sent: false, reason: "not_primary_shard" };

  try {
    const status = await collectStatus({ client, commands, stats });
    const user = await client.users.fetch(STARTUP_DM_USER_ID);
    await user.send({ embeds: [buildStartupEmbed(status)] });
    logger?.info?.("startup status report sent");
    return { sent: true };
  } catch (err) {
    logger?.error?.({ err }, "failed to send startup status report");
    return { sent: false, reason: "error" };
  }
}
