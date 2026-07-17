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
import { PingHistory } from "./lib/PingHistory.js";
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
import { LevelingService } from "./modules/leveling/LevelingService.js";
import { TicketService } from "./modules/tickets/TicketService.js";
import { WatchVcService } from "./modules/watchvc/WatchVcService.js";
import { realDeps as watchVcDeps } from "./modules/watchvc/deps.js";
import { DashboardService } from "./modules/dashboard/DashboardService.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A bad token or forbidden bot won't fix itself; a Discord 5xx will.
function isFatalLogin(err) {
  const status = err?.status ?? err?.httpStatus;
  return err?.code === "TokenInvalid" || status === 401 || status === 403;
}

// client.login() fetches gateway info from Discord; that call can return a
// transient 500, which used to crash the shard (process.exit(1)) and — because
// the manager auto-respawns — spin into a restart loop. Retry with capped
// backoff so a Discord hiccup self-heals; only genuine auth errors abort.
export async function loginWithRetry(client, token, logger) {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.login(token);
      return;
    } catch (err) {
      if (isFatalLogin(err)) throw err;
      const status = err?.status ?? err?.httpStatus;
      const delayMs = Math.min(60_000, 5_000 * 2 ** Math.min(attempt - 1, 4));
      logger?.warn?.(
        { attempt, status, err: err?.message ?? String(err) },
        "login failed (transient); retrying",
      );
      await sleep(delayMs);
    }
  }
}

export async function startBot() {
  const env = loadEnv();
  const logger = createLogger({ level: env.logLevel, pretty: env.nodeEnv !== "production" });
  const prisma = createPrisma();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
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

  const config = new ConfigService(prisma);

  const context = {
    client,
    logger,
    prisma,
    commands,
    config,
    stats: new StatsService(prisma),
    cooldowns: new Cooldowns(),
    pingHistory: new PingHistory(),
    scheduler: new Scheduler({ cron, logger }),
    antinuke: new AntinukeState(),
    cases: new CaseService(prisma),
    invites: new InviteService(prisma),
    inviteCache: new InviteCache(),
    automod: new AutomodState(),
    reactionRoles: new ReactionRoleService(prisma),
    leveling: new LevelingService(prisma),
    tickets: new TicketService(prisma),
    watchvc: new WatchVcService({ client, logger, config, deps: watchVcDeps(client) }),
    dashboards: new DashboardService({ logger, prisma, refreshMs: 90_000 }),
  };

  bindEvents(client, listeners, context);
  registerExpiryJob(context);
  registerModLogListener(context);
  client.once("ready", (c) =>
    logger.info(`Logged in as ${c.user.tag} (shard ready)`));


  await loginWithRetry(client, env.token, logger);

  const pingSampler = setInterval(() => context.pingHistory.push(client.ws.ping), 10_000);
  pingSampler.unref?.();

  return { client, context };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startBot().catch((err) => {
    console.error("Failed to start bot:", err);
    process.exit(1);
  });
}
