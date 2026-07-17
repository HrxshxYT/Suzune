import { ShardingManager } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const botPath = join(dirname(fileURLToPath(import.meta.url)), "bot.js");

// A stray rejection from a background Discord REST call (e.g. a transient 500)
// must not take the whole process down — log it and keep running.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const manager = new ShardingManager(botPath, {
  token: env.token,
  totalShards: env.shardCount, // "auto" or a number
});

manager.on("shardCreate", (shard) => console.log(`Launched shard ${shard.id}`));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Auth/config failures won't fix themselves; everything else (Discord 5xx,
// rate limits, network blips) is transient and worth retrying.
function isFatal(err) {
  const status = err?.status ?? err?.httpStatus;
  // Once shards exist, spawn() can't be safely re-run in-process — bail so the
  // host restarts us with a clean slate instead of looping on the same error.
  if (/already.*spawn/i.test(err?.message ?? "")) return true;
  return err?.code === "TokenInvalid" || status === 401 || status === 403;
}

// Spawning is the one startup step that talks to Discord ("auto" first fetches
// the recommended shard count). If Discord answers with a 500 we used to crash
// and let the host restart us — which just hammers Discord into more 500s. Retry
// in-process with capped exponential backoff so a transient outage self-heals
// instead of becoming a restart loop.
async function spawnWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try {
      await manager.spawn();
      console.log("All shards spawned.");
      return;
    } catch (err) {
      if (isFatal(err)) {
        console.error("Fatal startup error — check DISCORD_TOKEN / bot permissions:", err?.message ?? err);
        process.exit(1);
      }
      const status = err?.status ?? err?.httpStatus;
      const delayMs = Math.min(60_000, 5_000 * 2 ** Math.min(attempt - 1, 4));
      console.error(
        `Shard spawn attempt ${attempt} failed${status ? ` (HTTP ${status})` : ""}: ` +
          `${err?.message ?? err}. Retrying in ${Math.round(delayMs / 1000)}s…`,
      );
      await sleep(delayMs);
    }
  }
}

await spawnWithRetry();
