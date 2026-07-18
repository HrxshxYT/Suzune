import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { COLORS, BOT_NAME } from "../../lib/constants.js";
import { buildStatusCard } from "./statusCard.js";

// The user who receives a status report every time the bot starts up.
export const STARTUP_DM_USER_ID = "607412964328210441";
const CARD_FILENAME = "status.png";
// How many of the bot's biggest servers to spotlight on the status card.
export const TOP_SERVER_LIMIT = 5;
// How many of the bot's most recently joined servers to list in the embed.
export const RECENT_SERVER_LIMIT = 3;

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

// A lightweight, serialisable summary of every guild — enough to rank them and
// then resolve the winners' icons and owners.
function localGuildSummaries(client) {
  const cache = client.guilds?.cache;
  const values = typeof cache?.values === "function" ? [...cache.values()] : [];
  return values.map((g) => ({
    name: g.name ?? null,
    memberCount: g.memberCount ?? 0,
    iconURL: typeof g.iconURL === "function" ? g.iconURL({ extension: "png", size: 128 }) : null,
    ownerId: g.ownerId ?? null,
    joinedTimestamp: g.joinedTimestamp ?? null,
  }));
}

async function guildSummaries(client) {
  if (client.shard) {
    try {
      const perShard = await client.shard.broadcastEval((c) =>
        c.guilds.cache.map((g) => ({
          name: g.name ?? null,
          memberCount: g.memberCount ?? 0,
          iconURL: typeof g.iconURL === "function" ? g.iconURL({ extension: "png", size: 128 }) : null,
          ownerId: g.ownerId ?? null,
          joinedTimestamp: g.joinedTimestamp ?? null,
        })),
      );
      return perShard.flat();
    } catch {
      // A sibling shard may not be ready yet — spotlight what this one can see.
      return localGuildSummaries(client);
    }
  }
  return localGuildSummaries(client);
}

async function fetchPng(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function resolveOwnerName(client, ownerId) {
  if (!ownerId) return "Unknown";
  try {
    const user = await client.users.fetch(ownerId);
    return user.globalName ?? user.username ?? "Unknown";
  } catch {
    return "Unknown";
  }
}

// The bot's biggest servers (by member count) with their icon bytes and owner
// name resolved, ready to render on the status card.
export async function collectTopServers(client, limit = TOP_SERVER_LIMIT) {
  const top = (await guildSummaries(client))
    .slice()
    .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
    .slice(0, limit);
  return Promise.all(
    top.map(async (g) => ({
      name: g.name ?? "Unknown server",
      memberCount: g.memberCount ?? 0,
      ownerName: await resolveOwnerName(client, g.ownerId),
      iconPng: await fetchPng(g.iconURL),
    })),
  );
}

// The servers the bot most recently joined (by join time), with owner names
// resolved. Rendered as a text field in the embed, not on the image card.
export async function collectRecentServers(client, limit = RECENT_SERVER_LIMIT) {
  const recent = (await guildSummaries(client))
    .slice()
    .sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0))
    .slice(0, limit);
  return Promise.all(
    recent.map(async (g) => ({
      name: g.name ?? "Unknown server",
      ownerName: await resolveOwnerName(client, g.ownerId),
      joinedTimestamp: g.joinedTimestamp ?? null,
    })),
  );
}

export async function collectStatus({ client, commands }) {
  const names = [...commands.keys()].sort();
  const [guildCount, totalMembers, topServers, recentServers] = await Promise.all([
    countGuilds(client),
    countMembers(client),
    collectTopServers(client),
    collectRecentServers(client),
  ]);
  return {
    ping: client.ws.ping,
    commandCount: names.length,
    commandNames: names,
    guildCount,
    totalMembers,
    topServers,
    recentServers,
  };
}

// The DM payload: a clean embed with just a title, the analytics card image,
// and a footer crediting the developer with the timestamp.
// Formats the recently-joined servers as an embed field value, using Discord's
// relative timestamp so "joined X ago" stays live. Returns null when empty.
export function formatRecentServersField(servers = []) {
  if (!servers.length) return null;
  return servers
    .map((s, i) => {
      const when = s.joinedTimestamp
        ? ` · joined <t:${Math.floor(s.joinedTimestamp / 1000)}:R>`
        : "";
      return `**${i + 1}.** ${s.name} · owner ${s.ownerName}${when}`;
    })
    .join("\n");
}

export async function buildStartupMessage(status) {
  const png = await buildStatusCard(status);
  const file = new AttachmentBuilder(png, { name: CARD_FILENAME });
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(`🟢 ${BOT_NAME} — Online`)
    .setImage(`attachment://${CARD_FILENAME}`)
    .setFooter({ text: "Developed by hrxshxforpresident" })
    .setTimestamp();

  const recentField = formatRecentServersField(status.recentServers);
  if (recentField) {
    embed.addFields({ name: "🆕 Recently Added Servers", value: recentField });
  }

  return { embeds: [embed], files: [file] };
}

// Sends the startup status report as a DM. Only the primary shard (id 0) sends,
// so a sharded fleet doesn't DM the recipient once per shard.
export async function sendStartupReport(ctx) {
  const { client, commands, logger } = ctx;
  if (client.shard && !client.shard.ids.includes(0)) return { sent: false, reason: "not_primary_shard" };

  try {
    const status = await collectStatus({ client, commands });
    const message = await buildStartupMessage(status);
    const user = await client.users.fetch(STARTUP_DM_USER_ID);
    await user.send(message);
    logger?.info?.("startup status report sent");
    return { sent: true };
  } catch (err) {
    logger?.error?.({ err }, "failed to send startup status report");
    return { sent: false, reason: "error" };
  }
}
