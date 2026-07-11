import { Client, GatewayIntentBits, Partials } from "discord.js";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import { loadEnv } from "./config/env.js";
import { createPrisma } from "./core/db.js";
import { createLogger } from "./core/Logger.js";
import { ConfigService } from "./core/ConfigService.js";
import { StatsService } from "./core/StatsService.js";
import { Cooldowns } from "./core/Cooldowns.js";
import { Scheduler } from "./core/Scheduler.js";
import { discoverCommands, buildCommandMap } from "./core/CommandHandler.js";
import { discoverEvents, bindEvents } from "./core/EventHandler.js";
import { AntinukeState } from "./modules/antinuke/AntinukeState.js";
import { CaseService } from "./modules/moderation/CaseService.js";
import { registerExpiryJob } from "./modules/moderation/expiry.js";
import { registerModLogListener } from "./modules/logging/modLog.js";
import { InviteService } from "./modules/invites/InviteService.js";
import { InviteCache } from "./modules/invites/InviteCache.js";
import { AutomodState } from "./modules/automod/AutomodState.js";
import { ReactionRoleService } from "./modules/welcome/ReactionRoleService.js";

export async function startBot() {
  const env = loadEnv();
  const logger = createLogger({ level: env.logLevel, pretty: env.nodeEnv !== "production" });
  const prisma = createPrisma();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildEmojisAndStickers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
      Partials.GuildMember,
      Partials.User,
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
    ],
  });

  const modulesDir = join(dirname(fileURLToPath(import.meta.url)), "modules");
  const commands = buildCommandMap(await discoverCommands(modulesDir));
  const listeners = await discoverEvents(modulesDir);

  const context = {
    client,
    logger,
    prisma,
    commands,
    config: new ConfigService(prisma),
    stats: new StatsService(prisma),
    cooldowns: new Cooldowns(),
    scheduler: new Scheduler({ cron, logger }),
    antinuke: new AntinukeState(),
    cases: new CaseService(prisma),
    invites: new InviteService(prisma),
    inviteCache: new InviteCache(),
    automod: new AutomodState(),
    reactionRoles: new ReactionRoleService(prisma),
  };

  bindEvents(client, listeners, context);
  registerExpiryJob(context);
  registerModLogListener(context);
  client.once("ready", (c) => 
    logger.info(`Logged in as ${c.user.tag} (shard ready)`));


  await client.login(env.token);
  return { client, context };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startBot().catch((err) => {
    console.error("Failed to start bot:", err);
    process.exit(1);
  });
}
