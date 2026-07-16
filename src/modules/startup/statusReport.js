import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { COLORS, BOT_NAME } from "../../lib/constants.js";
import { buildStatusCard } from "./statusCard.js";

// The user who receives a status report every time the bot starts up.
export const STARTUP_DM_USER_ID = "607412964328210441";
const CARD_FILENAME = "status.png";

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

function localMemberSum(client) {
  const cache = client.guilds?.cache;
  const values = typeof cache?.values === "function" ? [...cache.values()] : [];
  return values.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);
}

// Total members the bot is guarding across every server on every shard.
export async function countMembers(client) {
  if (client.shard) {
    try {
      const perShard = await client.shard.broadcastEval((c) =>
        c.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0),
      );
      return perShard.reduce((sum, n) => sum + (n ?? 0), 0);
    } catch {
      return localMemberSum(client);
    }
  }
  return localMemberSum(client);
}

export async function collectStatus({ client, commands }) {
  const names = [...commands.keys()].sort();
  const [guildCount, totalMembers] = await Promise.all([countGuilds(client), countMembers(client)]);
  return {
    ping: client.ws.ping,
    commandCount: names.length,
    commandNames: names,
    guildCount,
    totalMembers,
  };
}

// The DM payload: a clean embed with just a title, the analytics card image,
// and a footer crediting the developer with the timestamp.
export function buildStartupMessage(status) {
  const png = buildStatusCard(status);
  const file = new AttachmentBuilder(png, { name: CARD_FILENAME });
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(`🟢 ${BOT_NAME} — Online`)
    .setImage(`attachment://${CARD_FILENAME}`)
    .setFooter({ text: "Developed by hrxshxforpresident" })
    .setTimestamp();
  return { embeds: [embed], files: [file] };
}

// Sends the startup status report as a DM. Only the primary shard (id 0) sends,
// so a sharded fleet doesn't DM the recipient once per shard.
export async function sendStartupReport(ctx) {
  const { client, commands, logger } = ctx;
  if (client.shard && !client.shard.ids.includes(0)) return { sent: false, reason: "not_primary_shard" };

  try {
    const status = await collectStatus({ client, commands });
    const user = await client.users.fetch(STARTUP_DM_USER_ID);
    await user.send(buildStartupMessage(status));
    logger?.info?.("startup status report sent");
    return { sent: true };
  } catch (err) {
    logger?.error?.({ err }, "failed to send startup status report");
    return { sent: false, reason: "error" };
  }
}
