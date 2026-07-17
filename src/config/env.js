import { z } from "zod";

const shardCount = z.union([z.literal("auto"), z.coerce.number().int().positive()]).default("auto");

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DEV_GUILD_ID: z.string().optional(),
  // NOTE: must NOT be named SHARD_COUNT — discord.js reads process.env.SHARD_COUNT
  // to auto-detect spawned shards, which would crash a standalone Client with "auto".
  BOT_SHARD_COUNT: shardCount,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  // Optional Lavalink node — music stays disabled when LAVALINK_HOST is unset.
  LAVALINK_HOST: z.string().min(1).optional(),
  LAVALINK_PORT: z.coerce.number().int().positive().default(2333),
  LAVALINK_PASSWORD: z.string().default(""),
  // z.coerce.boolean() treats "false" as true; parse the string explicitly.
  LAVALINK_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export function loadEnv(raw = process.env) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  const e = parsed.data;
  return {
    token: e.DISCORD_TOKEN,
    clientId: e.DISCORD_CLIENT_ID,
    databaseUrl: e.DATABASE_URL,
    nodeEnv: e.NODE_ENV,
    devGuildId: e.DEV_GUILD_ID,
    shardCount: e.BOT_SHARD_COUNT,
    logLevel: e.LOG_LEVEL,
    lavalink: e.LAVALINK_HOST
      ? {
          host: e.LAVALINK_HOST,
          port: e.LAVALINK_PORT,
          password: e.LAVALINK_PASSWORD,
          secure: e.LAVALINK_SECURE,
        }
      : null,
  };
}
