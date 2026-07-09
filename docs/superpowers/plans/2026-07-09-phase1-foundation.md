# Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, shard-ready bot framework — dependency-injected core services (config, permissions, cooldowns, errors, logging, scheduling), reusable libs, the Prisma data layer, command/event loaders, and a running bot that registers and responds to a `/ping` slash command.

**Architecture:** Modular monolith. A `ShardingManager` (`src/index.js`) spawns per-shard clients (`src/bot.js`). Each shard wires a set of **dependency-injected** core services and auto-discovers command/event modules. Pure logic (duration parsing, hierarchy checks, cooldowns, config resolution) is isolated into unit-testable units; discord.js and Prisma are injected so they can be mocked. Feature modules (anti-nuke, moderation, logging, config, help) are built in later plans on top of this foundation.

**Tech Stack:** Node.js 25 (ESM), discord.js v14, PostgreSQL + Prisma, Zod, pino, node-cron, Vitest, ESLint, Prettier.

## Global Constraints

- **Node.js 25**, ES modules only (`"type": "module"` in package.json, `import`/`export`, no `require`).
- **discord.js v14** API surface only (e.g. `GuildAuditLogEntryCreate`, `EmbedBuilder`, `SlashCommandBuilder`, `Events` enum, `PermissionFlagsBits`).
- **PostgreSQL via Prisma** — no raw SQL in application code; all DB access goes through the injected Prisma client.
- **Dependency injection** — core services receive their dependencies (Prisma client, discord client, logger) via constructor args; no module-level singletons reaching into globals. This is what makes them unit-testable.
- **A guild lives on exactly one shard** — per-guild in-memory caches/counters are safe; do NOT add cross-shard shared state (no Redis).
- **Never crash a shard** — command/event execution is wrapped by `core/Errors.js`.
- **Tests:** Vitest. Test files are `*.test.js` colocated under `test/` mirroring `src/`. Run a single file with `npx vitest run <path>`; a single test with `npx vitest run <path> -t "<name>"`.
- **Commit** after each task's tests pass, using Conventional Commits (`feat:`, `test:`, `chore:`).

---

### Task 1: Project scaffold, dependencies, and tooling

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `.eslintrc.json`
- Create: `.prettierrc.json`
- Create: `.env.example`
- Create: `src/lib/constants.js`
- Create: `test/smoke.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `constants.js` exports `COLORS` (`{ success: 0x57F287, error: 0xED4245, info: 0x5865F2, warn: 0xFEE75C }`) and `LIMITS` (`{ embedDescription: 4096 }`); a working `npm test` / `npm run lint` toolchain.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "discord-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=25" },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "register": "node src/scripts/register-commands.js",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@prisma/client": "^6.1.0",
    "discord.js": "^14.16.3",
    "dotenv": "^16.4.5",
    "node-cron": "^3.0.3",
    "pino": "^9.5.0",
    "pino-pretty": "^13.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "eslint": "^9.14.0",
    "prettier": "^3.3.3",
    "prisma": "^6.1.0",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Write `vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    globals: false,
  },
});
```

- [ ] **Step 3: Write `.eslintrc.json`, `.prettierrc.json`, `.env.example`**

`.eslintrc.json`:
```json
{
  "root": true,
  "env": { "node": true, "es2024": true },
  "parserOptions": { "ecmaVersion": "latest", "sourceType": "module" },
  "extends": "eslint:recommended",
  "rules": { "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }] }
}
```

`.prettierrc.json`:
```json
{ "singleQuote": false, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

`.env.example`:
```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DATABASE_URL=postgresql://user:pass@localhost:5432/discordbot
NODE_ENV=development
DEV_GUILD_ID=
SHARD_COUNT=auto
LOG_LEVEL=info
```

- [ ] **Step 4: Write `src/lib/constants.js`**

```js
export const COLORS = {
  success: 0x57f287,
  error: 0xed4245,
  info: 0x5865f2,
  warn: 0xfee75c,
};

export const LIMITS = {
  embedDescription: 4096,
  embedFieldValue: 1024,
  fieldsPerPage: 6,
};
```

- [ ] **Step 5: Write the smoke test `test/smoke.test.js`**

```js
import { describe, it, expect } from "vitest";
import { COLORS, LIMITS } from "../src/lib/constants.js";

describe("constants", () => {
  it("exposes brand colors and limits", () => {
    expect(COLORS.success).toBe(0x57f287);
    expect(LIMITS.embedDescription).toBe(4096);
  });
});
```

- [ ] **Step 6: Install dependencies and run the smoke test**

Run: `npm install && npx vitest run test/smoke.test.js`
Expected: install completes; 1 test file, 1 test PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js .eslintrc.json .prettierrc.json .env.example src/lib/constants.js test/smoke.test.js
git commit -m "chore: scaffold project, tooling, and constants"
```

---

### Task 2: Environment validation (`src/config/env.js`)

**Files:**
- Create: `src/config/env.js`
- Test: `test/config/env.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadEnv(raw)` — pure function taking a plain object (defaults to `process.env`), returning a validated, typed config object `{ token, clientId, databaseUrl, nodeEnv, devGuildId, shardCount, logLevel }`. Throws a descriptive `Error` if required vars are missing. `shardCount` is the string `"auto"` or a positive integer.

- [ ] **Step 1: Write the failing test `test/config/env.test.js`**

```js
import { describe, it, expect } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const base = {
  DISCORD_TOKEN: "t",
  DISCORD_CLIENT_ID: "123",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
};

describe("loadEnv", () => {
  it("parses a valid environment with defaults", () => {
    const env = loadEnv(base);
    expect(env.token).toBe("t");
    expect(env.clientId).toBe("123");
    expect(env.nodeEnv).toBe("development");
    expect(env.shardCount).toBe("auto");
    expect(env.logLevel).toBe("info");
  });

  it("coerces a numeric SHARD_COUNT", () => {
    const env = loadEnv({ ...base, SHARD_COUNT: "4" });
    expect(env.shardCount).toBe(4);
  });

  it("throws when a required var is missing", () => {
    expect(() => loadEnv({ DISCORD_TOKEN: "t" })).toThrow(/DISCORD_CLIENT_ID|DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/config/env.test.js`
Expected: FAIL — cannot find module `../../src/config/env.js`.

- [ ] **Step 3: Write `src/config/env.js`**

```js
import { z } from "zod";

const shardCount = z
  .union([z.literal("auto"), z.coerce.number().int().positive()])
  .default("auto");

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DEV_GUILD_ID: z.string().optional(),
  SHARD_COUNT: shardCount,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
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
    shardCount: e.SHARD_COUNT,
    logLevel: e.LOG_LEVEL,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/config/env.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/config/env.js test/config/env.test.js
git commit -m "feat: add validated environment loader"
```

---

### Task 3: Prisma schema, migration, and DB client (`prisma/schema.prisma`, `src/core/db.js`)

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/core/db.js`
- Test: `test/core/db.test.js`

**Interfaces:**
- Consumes: `loadEnv` (for `DATABASE_URL`, read by Prisma directly from env).
- Produces: `createPrisma()` returning a `PrismaClient` singleton (subsequent calls return the same instance); models `Guild`, `AntinukeConfig`, `Whitelist`, `LoggingConfig`, `ModRole`, `Case`.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Guild {
  id            String          @id
  createdAt     DateTime        @default(now())
  modLogEnabled Boolean         @default(false)
  dmOnAction    Boolean         @default(true)
  antinuke      AntinukeConfig?
  logging       LoggingConfig?
  whitelist     Whitelist[]
  modRoles      ModRole[]
  cases         Case[]
}

model AntinukeConfig {
  guildId          String   @id
  guild            Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
  enabled          Boolean  @default(false)
  punishment       String   @default("ban") // ban | kick | strip | quarantine | removeperms
  autoRevert       Boolean  @default(true)
  alertChannelId   String?
  quarantineRoleId String?
  antiRaidEnabled  Boolean  @default(false)
  raidJoinCount    Int      @default(10)
  raidWindowSec    Int      @default(10)
  panicMode        Boolean  @default(false)
  thresholds       Json     @default("{}") // { actionKey: { limit, windowSec, enabled } }
}

model Whitelist {
  id        String @id @default(cuid())
  guildId   String
  guild     Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  targetId  String
  type      String // user | role
  addedById String
  createdAt DateTime @default(now())

  @@unique([guildId, targetId])
}

model LoggingConfig {
  guildId          String @id
  guild            Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  memberJoinLeave  String?
  messageEdit      String?
  messageDelete    String?
  modActions       String?
  roleChanges      String?
  channelChanges   String?
  voice            String?
  serverChanges    String?
  disabled         Json    @default("[]") // list of category keys turned off
}

model ModRole {
  id      String @id @default(cuid())
  guildId String
  guild   Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  roleId  String

  @@unique([guildId, roleId])
}

model Case {
  id          String   @id @default(cuid())
  guildId     String
  guild       Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
  caseNumber  Int
  type        String   // ban|tempban|softban|kick|timeout|mute|warn|unban|unmute
  targetId    String
  moderatorId String
  reason      String   @default("No reason provided")
  createdAt   DateTime @default(now())
  expiresAt   DateTime?
  active      Boolean  @default(true)

  @@unique([guildId, caseNumber])
  @@index([guildId, targetId])
}
```

- [ ] **Step 2: Write `src/core/db.js`**

```js
import { PrismaClient } from "@prisma/client";

let client;

export function createPrisma() {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}
```

- [ ] **Step 3: Write `test/core/db.test.js`** (asserts singleton behavior, no live DB)

```js
import { describe, it, expect } from "vitest";
import { createPrisma } from "../../src/core/db.js";

describe("createPrisma", () => {
  it("returns the same instance on repeated calls", () => {
    const a = createPrisma();
    const b = createPrisma();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 4: Generate the client and run the test**

Run: `npx prisma generate && npx vitest run test/core/db.test.js`
Expected: client generated; 1 test PASS.

- [ ] **Step 5: Create the migration** (requires a reachable Postgres from `DATABASE_URL`)

Run: `cp .env.example .env` then set a real `DATABASE_URL`, then `npx prisma migrate dev --name init`
Expected: migration `init` created and applied; tables exist.

Note: if no Postgres is available in the build environment, run `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/manual_init.sql` to produce the SQL for review, and defer applying until a DB is provisioned. Do not block later pure-logic tasks on this.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/core/db.js test/core/db.test.js prisma/migrations
git commit -m "feat: add Prisma schema, migration, and db client"
```

---

### Task 4: Duration parser/formatter (`src/lib/duration.js`)

**Files:**
- Create: `src/lib/duration.js`
- Test: `test/lib/duration.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseDuration(input: string): number | null` — `"10m"|"2h"|"7d"|"30s"|"1w"|"90m"` → milliseconds; supports concatenated units (`"1h30m"`); returns `null` for invalid input.
  - `formatDuration(ms: number): string` — `5400000` → `"1h 30m"`.

- [ ] **Step 1: Write the failing test `test/lib/duration.test.js`**

```js
import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration } from "../../src/lib/duration.js";

describe("parseDuration", () => {
  it("parses single units", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("7d")).toBe(604_800_000);
    expect(parseDuration("1w")).toBe(604_800_000);
  });

  it("parses concatenated units", () => {
    expect(parseDuration("1h30m")).toBe(5_400_000);
  });

  it("returns null for invalid input", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("10x")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats milliseconds into compact units", () => {
    expect(formatDuration(5_400_000)).toBe("1h 30m");
    expect(formatDuration(30_000)).toBe("30s");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/lib/duration.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/duration.js`**

```js
const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDuration(input) {
  if (typeof input !== "string" || input.trim() === "") return null;
  const re = /(\d+)\s*([smhdw])/gi;
  let total = 0;
  let matched = false;
  let consumed = "";
  for (const m of input.matchAll(re)) {
    matched = true;
    consumed += m[0];
    total += Number(m[1]) * UNIT_MS[m[2].toLowerCase()];
  }
  // Reject strings that contain stray non-matching characters (e.g. "10x").
  if (!matched || consumed.replace(/\s/g, "").length !== input.replace(/\s/g, "").length) {
    return null;
  }
  return total;
}

export function formatDuration(ms) {
  if (ms <= 0) return "0s";
  const order = [
    ["w", UNIT_MS.w],
    ["d", UNIT_MS.d],
    ["h", UNIT_MS.h],
    ["m", UNIT_MS.m],
    ["s", UNIT_MS.s],
  ];
  const parts = [];
  let rem = ms;
  for (const [label, size] of order) {
    const value = Math.floor(rem / size);
    if (value > 0) {
      parts.push(`${value}${label}`);
      rem -= value * size;
    }
  }
  return parts.join(" ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/lib/duration.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/duration.js test/lib/duration.test.js
git commit -m "feat: add duration parser and formatter"
```

---

### Task 5: Role-hierarchy safety helpers (`src/lib/hierarchy.js`)

**Files:**
- Create: `src/lib/hierarchy.js`
- Test: `test/lib/hierarchy.test.js`

**Interfaces:**
- Consumes: nothing (operates on minimal member-shaped objects with `{ id, roles: { highest: { position } }, guild: { ownerId } }`).
- Produces:
  - `isAboveOrEqual(a, b): boolean` — true if member `a`'s highest role position ≥ `b`'s.
  - `canActOn({ actor, target, botMember }): { ok: boolean, reason?: string }` — enforces: target is not the owner, actor outranks target, bot outranks target. Returns a machine-usable reason key (`"target_is_owner" | "actor_not_higher" | "bot_not_higher"`) when not ok.

- [ ] **Step 1: Write the failing test `test/lib/hierarchy.test.js`**

```js
import { describe, it, expect } from "vitest";
import { isAboveOrEqual, canActOn } from "../../src/lib/hierarchy.js";

const member = (id, pos, ownerId = "owner") => ({
  id,
  roles: { highest: { position: pos } },
  guild: { ownerId },
});

describe("isAboveOrEqual", () => {
  it("compares highest role positions", () => {
    expect(isAboveOrEqual(member("a", 5), member("b", 3))).toBe(true);
    expect(isAboveOrEqual(member("a", 3), member("b", 3))).toBe(true);
    expect(isAboveOrEqual(member("a", 2), member("b", 3))).toBe(false);
  });
});

describe("canActOn", () => {
  const bot = member("bot", 9);
  it("allows when actor and bot both outrank a non-owner target", () => {
    const res = canActOn({ actor: member("a", 5), target: member("t", 3), botMember: bot });
    expect(res.ok).toBe(true);
  });
  it("blocks acting on the guild owner", () => {
    const target = member("owner", 3);
    const res = canActOn({ actor: member("a", 5), target, botMember: bot });
    expect(res).toEqual({ ok: false, reason: "target_is_owner" });
  });
  it("blocks when actor does not outrank target", () => {
    const res = canActOn({ actor: member("a", 3), target: member("t", 4), botMember: bot });
    expect(res).toEqual({ ok: false, reason: "actor_not_higher" });
  });
  it("blocks when the bot does not outrank target", () => {
    const res = canActOn({ actor: member("a", 8), target: member("t", 9), botMember: bot });
    expect(res).toEqual({ ok: false, reason: "bot_not_higher" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/lib/hierarchy.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/hierarchy.js`**

```js
export function isAboveOrEqual(a, b) {
  return a.roles.highest.position >= b.roles.highest.position;
}

export function canActOn({ actor, target, botMember }) {
  if (target.id === target.guild.ownerId) {
    return { ok: false, reason: "target_is_owner" };
  }
  if (!isAbove(actor, target)) {
    return { ok: false, reason: "actor_not_higher" };
  }
  if (!isAbove(botMember, target)) {
    return { ok: false, reason: "bot_not_higher" };
  }
  return { ok: true };
}

function isAbove(a, b) {
  return a.roles.highest.position > b.roles.highest.position;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/lib/hierarchy.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hierarchy.js test/lib/hierarchy.test.js
git commit -m "feat: add role-hierarchy safety helpers"
```

---

### Task 6: Embed builders (`src/lib/embeds.js`)

**Files:**
- Create: `src/lib/embeds.js`
- Test: `test/lib/embeds.test.js`

**Interfaces:**
- Consumes: `COLORS` from `constants.js`; `EmbedBuilder` from discord.js.
- Produces: `successEmbed(text)`, `errorEmbed(text)`, `infoEmbed(title, text)`, `warnEmbed(text)` — each returns a discord.js `EmbedBuilder` with the right color and description. `.data` exposes the serialized fields for assertions.

- [ ] **Step 1: Write the failing test `test/lib/embeds.test.js`**

```js
import { describe, it, expect } from "vitest";
import { successEmbed, errorEmbed, infoEmbed } from "../../src/lib/embeds.js";
import { COLORS } from "../../src/lib/constants.js";

describe("embeds", () => {
  it("builds a success embed with the success color", () => {
    const e = successEmbed("done");
    expect(e.data.color).toBe(COLORS.success);
    expect(e.data.description).toContain("done");
  });
  it("builds an error embed with the error color", () => {
    const e = errorEmbed("nope");
    expect(e.data.color).toBe(COLORS.error);
  });
  it("builds an info embed with a title", () => {
    const e = infoEmbed("Title", "body");
    expect(e.data.title).toBe("Title");
    expect(e.data.color).toBe(COLORS.info);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/lib/embeds.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/embeds.js`**

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "./constants.js";

export function successEmbed(text) {
  return new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ ${text}`);
}

export function errorEmbed(text) {
  return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${text}`);
}

export function warnEmbed(text) {
  return new EmbedBuilder().setColor(COLORS.warn).setDescription(`⚠️ ${text}`);
}

export function infoEmbed(title, text) {
  return new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(text);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/lib/embeds.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/embeds.js test/lib/embeds.test.js
git commit -m "feat: add branded embed builders"
```

---

### Task 7: Logger (`src/core/Logger.js`)

**Files:**
- Create: `src/core/Logger.js`
- Test: `test/core/Logger.test.js`

**Interfaces:**
- Consumes: `pino`.
- Produces: `createLogger({ level, pretty })` → a pino logger. In `test`/`development` with `pretty: true` it uses `pino-pretty` transport; otherwise plain JSON. Default level from arg.

- [ ] **Step 1: Write the failing test `test/core/Logger.test.js`**

```js
import { describe, it, expect } from "vitest";
import { createLogger } from "../../src/core/Logger.js";

describe("createLogger", () => {
  it("creates a logger at the requested level", () => {
    const log = createLogger({ level: "debug", pretty: false });
    expect(log.level).toBe("debug");
    expect(typeof log.info).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/core/Logger.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/Logger.js`**

```js
import pino from "pino";

export function createLogger({ level = "info", pretty = false } = {}) {
  if (pretty) {
    return pino({
      level,
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }
  return pino({ level });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/core/Logger.test.js`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/core/Logger.js test/core/Logger.test.js
git commit -m "feat: add pino logger factory"
```

---

### Task 8: Cooldowns (`src/core/Cooldowns.js`)

**Files:**
- Create: `src/core/Cooldowns.js`
- Test: `test/core/Cooldowns.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: class `Cooldowns` with `constructor(now = () => Date.now())` (injectable clock for tests) and `check(commandName, userId, seconds): { limited: boolean, retryAfterMs?: number }`. Calling `check` starts/refreshes the cooldown when not limited.

- [ ] **Step 1: Write the failing test `test/core/Cooldowns.test.js`**

```js
import { describe, it, expect } from "vitest";
import { Cooldowns } from "../../src/core/Cooldowns.js";

describe("Cooldowns", () => {
  it("allows the first use and blocks within the window", () => {
    let t = 1000;
    const cd = new Cooldowns(() => t);
    expect(cd.check("ban", "u1", 5).limited).toBe(false);
    t = 3000; // 2s later
    const second = cd.check("ban", "u1", 5);
    expect(second.limited).toBe(true);
    expect(second.retryAfterMs).toBe(3000);
  });

  it("allows again after the window passes", () => {
    let t = 1000;
    const cd = new Cooldowns(() => t);
    cd.check("ban", "u1", 5);
    t = 7000; // 6s later, past 5s
    expect(cd.check("ban", "u1", 5).limited).toBe(false);
  });

  it("keeps separate windows per user and command", () => {
    const cd = new Cooldowns(() => 1000);
    cd.check("ban", "u1", 5);
    expect(cd.check("ban", "u2", 5).limited).toBe(false);
    expect(cd.check("kick", "u1", 5).limited).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/core/Cooldowns.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/Cooldowns.js`**

```js
export class Cooldowns {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.map = new Map(); // key -> expiresAt (ms)
  }

  check(commandName, userId, seconds) {
    const key = `${commandName}:${userId}`;
    const nowMs = this.now();
    const expiresAt = this.map.get(key);
    if (expiresAt && expiresAt > nowMs) {
      return { limited: true, retryAfterMs: expiresAt - nowMs };
    }
    this.map.set(key, nowMs + seconds * 1000);
    return { limited: false };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/core/Cooldowns.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/Cooldowns.js test/core/Cooldowns.test.js
git commit -m "feat: add per-user command cooldowns"
```

---

### Task 9: ConfigService (`src/core/ConfigService.js`)

**Files:**
- Create: `src/core/ConfigService.js`
- Test: `test/core/ConfigService.test.js`

**Interfaces:**
- Consumes: an injected Prisma-like client exposing `guild.findUnique`, `guild.create`, `guild.update`.
- Produces: class `ConfigService`:
  - `constructor(prisma)`.
  - `async getGuild(guildId)` — returns the guild row (with `antinuke` and `logging` relations included). On cache miss reads DB; if the row is absent, creates a default row (`{ id: guildId }`). Caches the result in an in-memory `Map`.
  - `async updateGuild(guildId, data)` — writes through to `prisma.guild.update`, updates the cache, returns the updated row.
  - `invalidate(guildId)` — drops the cache entry.

- [ ] **Step 1: Write the failing test `test/core/ConfigService.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma(existing = null) {
  const store = existing ? { ...existing } : null;
  return {
    _row: store,
    guild: {
      findUnique: vi.fn(async () => store),
      create: vi.fn(async ({ data }) => ({ ...data, antinuke: null, logging: null })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  };
}

describe("ConfigService", () => {
  it("creates a default guild row on first access when none exists", async () => {
    const prisma = mockPrisma(null);
    const svc = new ConfigService(prisma);
    const row = await svc.getGuild("g1");
    expect(prisma.guild.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: "g1" }) }),
    );
    expect(row.id).toBe("g1");
  });

  it("caches after first read so DB is not hit twice", async () => {
    const prisma = mockPrisma({ id: "g1", antinuke: null, logging: null });
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(1);
  });

  it("writes through and refreshes cache on updateGuild", async () => {
    const prisma = mockPrisma({ id: "g1", dmOnAction: true, antinuke: null, logging: null });
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    const updated = await svc.updateGuild("g1", { dmOnAction: false });
    expect(updated.dmOnAction).toBe(false);
    const cached = await svc.getGuild("g1");
    expect(cached.dmOnAction).toBe(false);
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(1); // served from cache after update
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/core/ConfigService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/ConfigService.js`**

```js
const INCLUDE = { antinuke: true, logging: true };

export class ConfigService {
  constructor(prisma) {
    this.prisma = prisma;
    this.cache = new Map();
  }

  async getGuild(guildId) {
    if (this.cache.has(guildId)) {
      return this.cache.get(guildId);
    }
    let row = await this.prisma.guild.findUnique({ where: { id: guildId }, include: INCLUDE });
    if (!row) {
      row = await this.prisma.guild.create({ data: { id: guildId }, include: INCLUDE });
    }
    this.cache.set(guildId, row);
    return row;
  }

  async updateGuild(guildId, data) {
    const row = await this.prisma.guild.update({
      where: { id: guildId },
      data,
      include: INCLUDE,
    });
    this.cache.set(guildId, row);
    return row;
  }

  invalidate(guildId) {
    this.cache.delete(guildId);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/core/ConfigService.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ConfigService.js test/core/ConfigService.test.js
git commit -m "feat: add cached per-guild ConfigService"
```

---

### Task 10: PermissionService (`src/core/PermissionService.js`)

**Files:**
- Create: `src/core/PermissionService.js`
- Test: `test/core/PermissionService.test.js`

**Interfaces:**
- Consumes: `PermissionFlagsBits` from discord.js; `ConfigService` (for mod roles — passed as data, not called directly here).
- Produces: `canUseCommand({ member, command, modRoleIds })` → `{ ok, reason? }`. Rules: if `command.permissions` is empty → ok. Else ok if the member has any required Discord permission (`member.permissions.has(flag)`), OR the member has any role in `modRoleIds`. Reason key on failure: `"missing_permission"`.

- [ ] **Step 1: Write the failing test `test/core/PermissionService.test.js`**

```js
import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { canUseCommand } from "../../src/core/PermissionService.js";

const member = (perms = [], roleIds = []) => ({
  permissions: { has: (p) => perms.includes(p) },
  roles: { cache: new Map(roleIds.map((id) => [id, { id }])) },
});

describe("canUseCommand", () => {
  it("allows commands with no permission requirement", () => {
    const res = canUseCommand({ member: member(), command: { permissions: [] }, modRoleIds: [] });
    expect(res.ok).toBe(true);
  });

  it("allows when the member holds a required Discord permission", () => {
    const cmd = { permissions: [PermissionFlagsBits.BanMembers] };
    const res = canUseCommand({
      member: member([PermissionFlagsBits.BanMembers]),
      command: cmd,
      modRoleIds: [],
    });
    expect(res.ok).toBe(true);
  });

  it("allows when the member has a configured mod role", () => {
    const cmd = { permissions: [PermissionFlagsBits.BanMembers] };
    const res = canUseCommand({
      member: member([], ["modrole1"]),
      command: cmd,
      modRoleIds: ["modrole1"],
    });
    expect(res.ok).toBe(true);
  });

  it("blocks when neither permission nor mod role is present", () => {
    const cmd = { permissions: [PermissionFlagsBits.BanMembers] };
    const res = canUseCommand({ member: member(), command: cmd, modRoleIds: ["modrole1"] });
    expect(res).toEqual({ ok: false, reason: "missing_permission" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/core/PermissionService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/PermissionService.js`**

```js
export function canUseCommand({ member, command, modRoleIds = [] }) {
  const required = command.permissions ?? [];
  if (required.length === 0) return { ok: true };

  const hasPerm = required.some((flag) => member.permissions.has(flag));
  if (hasPerm) return { ok: true };

  const hasModRole = modRoleIds.some((id) => member.roles.cache.has(id));
  if (hasModRole) return { ok: true };

  return { ok: false, reason: "missing_permission" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/core/PermissionService.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/PermissionService.js test/core/PermissionService.test.js
git commit -m "feat: add command permission checks"
```

---

### Task 11: Error wrapper (`src/core/Errors.js`)

**Files:**
- Create: `src/core/Errors.js`
- Test: `test/core/Errors.test.js`

**Interfaces:**
- Consumes: `errorEmbed` from `lib/embeds.js`; a logger with `.error`.
- Produces: `runSafely({ fn, interaction, logger })` — awaits `fn()`; on throw, logs the error and replies (or follows up if already replied) with an ephemeral error embed. Never rethrows. Returns `true` on success, `false` on caught error.

- [ ] **Step 1: Write the failing test `test/core/Errors.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { runSafely } from "../../src/core/Errors.js";

function fakeInteraction() {
  return {
    replied: false,
    deferred: false,
    reply: vi.fn(async function () {
      this.replied = true;
    }),
    followUp: vi.fn(async () => {}),
  };
}
const logger = { error: vi.fn() };

describe("runSafely", () => {
  it("returns true and does not reply when fn succeeds", async () => {
    const interaction = fakeInteraction();
    const ok = await runSafely({ fn: async () => {}, interaction, logger });
    expect(ok).toBe(true);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("catches errors, logs, and replies ephemerally", async () => {
    const interaction = fakeInteraction();
    const ok = await runSafely({
      fn: async () => {
        throw new Error("boom");
      },
      interaction,
      logger,
    });
    expect(ok).toBe(false);
    expect(logger.error).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    );
  });

  it("uses followUp when the interaction was already replied", async () => {
    const interaction = fakeInteraction();
    interaction.replied = true;
    await runSafely({
      fn: async () => {
        throw new Error("boom");
      },
      interaction,
      logger,
    });
    expect(interaction.followUp).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/core/Errors.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/Errors.js`**

```js
import { errorEmbed } from "../lib/embeds.js";

export async function runSafely({ fn, interaction, logger }) {
  try {
    await fn();
    return true;
  } catch (err) {
    logger.error({ err }, "command execution failed");
    const payload = {
      embeds: [errorEmbed("Something went wrong running that command.")],
      ephemeral: true,
    };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (replyErr) {
      logger.error({ err: replyErr }, "failed to send error reply");
    }
    return false;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/core/Errors.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/Errors.js test/core/Errors.test.js
git commit -m "feat: add centralized interaction error wrapper"
```

---

### Task 12: Command loader (`src/core/CommandHandler.js`)

**Files:**
- Create: `src/core/CommandHandler.js`
- Test: `test/core/CommandHandler.test.js`

**Interfaces:**
- Consumes: nothing external in the tested unit (filesystem discovery is a thin wrapper around the pure builder).
- Produces:
  - `buildCommandMap(modules)` — pure function taking an array of command objects `{ data: { name }, execute, permissions? }` and returning a `Map<name, command>`; throws on duplicate names.
  - `toJSON(commandMap)` — returns an array of `command.data.toJSON()` for REST registration.
  - `discoverCommands(dir)` — async; globs `*/commands/*.js` under `dir`, imports each, returns the array of their default exports (integration-only; not unit tested).

- [ ] **Step 1: Write the failing test `test/core/CommandHandler.test.js`**

```js
import { describe, it, expect } from "vitest";
import { buildCommandMap, toJSON } from "../../src/core/CommandHandler.js";

const cmd = (name) => ({
  data: { name, toJSON: () => ({ name }) },
  execute: async () => {},
});

describe("buildCommandMap", () => {
  it("maps commands by name", () => {
    const map = buildCommandMap([cmd("ping"), cmd("ban")]);
    expect(map.size).toBe(2);
    expect(map.get("ping").data.name).toBe("ping");
  });

  it("throws on duplicate command names", () => {
    expect(() => buildCommandMap([cmd("ping"), cmd("ping")])).toThrow(/duplicate/i);
  });
});

describe("toJSON", () => {
  it("serializes each command's data", () => {
    const map = buildCommandMap([cmd("ping")]);
    expect(toJSON(map)).toEqual([{ name: "ping" }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/core/CommandHandler.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/CommandHandler.js`**

```js
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function buildCommandMap(modules) {
  const map = new Map();
  for (const command of modules) {
    const name = command.data.name;
    if (map.has(name)) {
      throw new Error(`Duplicate command name: ${name}`);
    }
    map.set(name, command);
  }
  return map;
}

export function toJSON(commandMap) {
  return [...commandMap.values()].map((c) => c.data.toJSON());
}

export async function discoverCommands(dir) {
  const modules = [];
  const moduleDirs = await readdir(dir, { withFileTypes: true });
  for (const md of moduleDirs) {
    if (!md.isDirectory()) continue;
    const cmdDir = join(dir, md.name, "commands");
    let files;
    try {
      files = await readdir(cmdDir);
    } catch {
      continue; // module has no commands folder
    }
    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      const mod = await import(pathToFileURL(join(cmdDir, file)).href);
      if (mod.default) modules.push(mod.default);
    }
  }
  return modules;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/core/CommandHandler.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/CommandHandler.js test/core/CommandHandler.test.js
git commit -m "feat: add command loader and registration helpers"
```

---

### Task 13: Event loader (`src/core/EventHandler.js`)

**Files:**
- Create: `src/core/EventHandler.js`
- Test: `test/core/EventHandler.test.js`

**Interfaces:**
- Consumes: nothing external in the tested unit.
- Produces:
  - `bindEvents(client, listeners, context)` — pure-ish: for each listener `{ name, once?, execute }`, registers `client.on(name, ...)` (or `client.once`) with a handler that calls `execute(context, ...args)`.
  - `discoverEvents(dir)` — async; globs `*/events/*.js`, imports default exports (integration-only; not unit tested).

- [ ] **Step 1: Write the failing test `test/core/EventHandler.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { bindEvents } from "../../src/core/EventHandler.js";

function fakeClient() {
  const handlers = { on: {}, once: {} };
  return {
    on: (name, fn) => (handlers.on[name] = fn),
    once: (name, fn) => (handlers.once[name] = fn),
    _handlers: handlers,
  };
}

describe("bindEvents", () => {
  it("registers on and once listeners and passes context", async () => {
    const client = fakeClient();
    const ctx = { flag: true };
    const spy = vi.fn();
    bindEvents(client, [{ name: "ready", once: true, execute: spy }], ctx);
    await client._handlers.once.ready("arg1");
    expect(spy).toHaveBeenCalledWith(ctx, "arg1");
  });

  it("registers recurring listeners with client.on", () => {
    const client = fakeClient();
    bindEvents(client, [{ name: "guildCreate", execute: () => {} }], {});
    expect(typeof client._handlers.on.guildCreate).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/core/EventHandler.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/EventHandler.js`**

```js
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function bindEvents(client, listeners, context) {
  for (const listener of listeners) {
    const handler = (...args) => listener.execute(context, ...args);
    if (listener.once) {
      client.once(listener.name, handler);
    } else {
      client.on(listener.name, handler);
    }
  }
}

export async function discoverEvents(dir) {
  const listeners = [];
  const moduleDirs = await readdir(dir, { withFileTypes: true });
  for (const md of moduleDirs) {
    if (!md.isDirectory()) continue;
    const evDir = join(dir, md.name, "events");
    let files;
    try {
      files = await readdir(evDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      const mod = await import(pathToFileURL(join(evDir, file)).href);
      if (mod.default) listeners.push(mod.default);
    }
  }
  return listeners;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/core/EventHandler.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/EventHandler.js test/core/EventHandler.test.js
git commit -m "feat: add event loader and binding"
```

---

### Task 14: Scheduler (`src/core/Scheduler.js`)

**Files:**
- Create: `src/core/Scheduler.js`
- Test: `test/core/Scheduler.test.js`

**Interfaces:**
- Consumes: `node-cron` (injected as `cron` for testability).
- Produces: class `Scheduler`:
  - `constructor({ cron, logger })`.
  - `every(expression, name, task)` — schedules a cron job; wraps `task` in try/catch that logs failures; stores the job under `name`; returns the job.
  - `stopAll()` — stops every scheduled job.

- [ ] **Step 1: Write the failing test `test/core/Scheduler.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { Scheduler } from "../../src/core/Scheduler.js";

function fakeCron() {
  const jobs = [];
  return {
    jobs,
    schedule: vi.fn((expr, fn) => {
      const job = { expr, fn, stop: vi.fn() };
      jobs.push(job);
      return job;
    }),
  };
}
const logger = { error: vi.fn(), info: vi.fn() };

describe("Scheduler", () => {
  it("schedules a named job", () => {
    const cron = fakeCron();
    const s = new Scheduler({ cron, logger });
    s.every("* * * * *", "cleanup", async () => {});
    expect(cron.schedule).toHaveBeenCalledOnce();
  });

  it("wraps task errors so they never throw out of the job", async () => {
    const cron = fakeCron();
    const s = new Scheduler({ cron, logger });
    s.every("* * * * *", "boom", async () => {
      throw new Error("fail");
    });
    await cron.jobs[0].fn(); // invoke the wrapped task
    expect(logger.error).toHaveBeenCalled();
  });

  it("stops all jobs", () => {
    const cron = fakeCron();
    const s = new Scheduler({ cron, logger });
    s.every("* * * * *", "a", async () => {});
    s.stopAll();
    expect(cron.jobs[0].stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/core/Scheduler.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/Scheduler.js`**

```js
export class Scheduler {
  constructor({ cron, logger }) {
    this.cron = cron;
    this.logger = logger;
    this.jobs = new Map();
  }

  every(expression, name, task) {
    const wrapped = async (...args) => {
      try {
        await task(...args);
      } catch (err) {
        this.logger.error({ err, job: name }, "scheduled task failed");
      }
    };
    const job = this.cron.schedule(expression, wrapped);
    this.jobs.set(name, job);
    return job;
  }

  stopAll() {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/core/Scheduler.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/Scheduler.js test/core/Scheduler.test.js
git commit -m "feat: add cron scheduler wrapper"
```

---

### Task 15: `/ping` command + interaction router (`src/modules/util/commands/ping.js`, `src/modules/util/events/interactionCreate.js`)

**Files:**
- Create: `src/modules/util/commands/ping.js`
- Create: `src/modules/util/events/interactionCreate.js`
- Test: `test/modules/util/ping.test.js`
- Test: `test/modules/util/interactionCreate.test.js`

**Interfaces:**
- Consumes: `SlashCommandBuilder`, `EmbedBuilder`; core services via the event `context` (`{ commands, config, cooldowns, logger }`); `canUseCommand` from `PermissionService`; `runSafely` from `Errors`.
- Produces:
  - `ping` command: `{ data: SlashCommandBuilder, permissions: [], execute(interaction, ctx) }` replying with latency.
  - `interactionCreate` listener: `{ name: "interactionCreate", execute(ctx, interaction) }` — routes chat-input commands: looks up the command, runs permission + cooldown checks, executes inside `runSafely`.

- [ ] **Step 1: Write the failing test `test/modules/util/ping.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import ping from "../../../src/modules/util/commands/ping.js";

describe("ping command", () => {
  it("has a name and no required permissions", () => {
    expect(ping.data.name).toBe("ping");
    expect(ping.permissions).toEqual([]);
  });

  it("replies with a latency embed", async () => {
    const interaction = {
      client: { ws: { ping: 42 } },
      reply: vi.fn(async () => {}),
    };
    await ping.execute(interaction, { logger: { info: vi.fn() } });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
});
```

- [ ] **Step 2: Write the failing test `test/modules/util/interactionCreate.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import listener from "../../../src/modules/util/events/interactionCreate.js";

function ctx(command) {
  return {
    commands: new Map(command ? [[command.data.name, command]] : []),
    config: { getGuild: vi.fn(async () => ({ modRoles: [] })) },
    cooldowns: { check: vi.fn(() => ({ limited: false })) },
    logger: { error: vi.fn(), info: vi.fn() },
  };
}

function interaction(name) {
  return {
    isChatInputCommand: () => true,
    commandName: name,
    guildId: "g1",
    member: { permissions: { has: () => true }, roles: { cache: new Map() } },
    reply: vi.fn(async () => {}),
    replied: false,
    deferred: false,
  };
}

describe("interactionCreate", () => {
  it("executes a known command", async () => {
    const execute = vi.fn(async () => {});
    const command = { data: { name: "ping" }, permissions: [], execute };
    await listener.execute(ctx(command), interaction("ping"));
    expect(execute).toHaveBeenCalled();
  });

  it("ignores unknown commands without throwing", async () => {
    await expect(listener.execute(ctx(null), interaction("nope"))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run test/modules/util`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `src/modules/util/commands/ping.js`**

```js
import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency."),
  permissions: [],
  async execute(interaction, _ctx) {
    const ws = Math.round(interaction.client.ws.ping);
    await interaction.reply({ embeds: [infoEmbed("🏓 Pong!", `WebSocket latency: **${ws}ms**`)] });
  },
};
```

- [ ] **Step 5: Write `src/modules/util/events/interactionCreate.js`**

```js
import { Events } from "discord.js";
import { canUseCommand } from "../../../core/PermissionService.js";
import { runSafely } from "../../../core/Errors.js";
import { errorEmbed } from "../../../lib/embeds.js";

export default {
  name: Events.InteractionCreate,
  async execute(ctx, interaction) {
    if (!interaction.isChatInputCommand()) return;
    const command = ctx.commands.get(interaction.commandName);
    if (!command) return;

    const guild = interaction.guildId ? await ctx.config.getGuild(interaction.guildId) : null;
    const modRoleIds = guild?.modRoles?.map((r) => r.roleId) ?? [];

    const perm = canUseCommand({ member: interaction.member, command, modRoleIds });
    if (!perm.ok) {
      await interaction.reply({
        embeds: [errorEmbed("You don't have permission to use that command.")],
        ephemeral: true,
      });
      return;
    }

    const cd = ctx.cooldowns.check(command.data.name, interaction.user?.id ?? interaction.member.id, command.cooldown ?? 3);
    if (cd.limited) {
      await interaction.reply({
        embeds: [errorEmbed(`Slow down — try again in ${Math.ceil(cd.retryAfterMs / 1000)}s.`)],
        ephemeral: true,
      });
      return;
    }

    await runSafely({
      fn: () => command.execute(interaction, ctx),
      interaction,
      logger: ctx.logger,
    });
  },
};
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `npx vitest run test/modules/util`
Expected: PASS — 4 tests total.

- [ ] **Step 7: Commit**

```bash
git add src/modules/util test/modules/util
git commit -m "feat: add ping command and interaction router"
```

---

### Task 16: Command registration script (`src/scripts/register-commands.js`)

**Files:**
- Create: `src/scripts/register-commands.js`

**Interfaces:**
- Consumes: `loadEnv`, `discoverCommands`, `buildCommandMap`, `toJSON`; discord.js `REST`, `Routes`.
- Produces: a runnable script (`npm run register`) that registers slash commands. Guild-scoped to `DEV_GUILD_ID` when set (instant), otherwise global.

- [ ] **Step 1: Write `src/scripts/register-commands.js`**

```js
import { REST, Routes } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import { loadEnv } from "../config/env.js";
import { discoverCommands, buildCommandMap, toJSON } from "../core/CommandHandler.js";

const env = loadEnv();
const modulesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "modules");

const commands = buildCommandMap(await discoverCommands(modulesDir));
const body = toJSON(commands);
const rest = new REST({ version: "10" }).setToken(env.token);

const route = env.devGuildId
  ? Routes.applicationGuildCommands(env.clientId, env.devGuildId)
  : Routes.applicationCommands(env.clientId);

const data = await rest.put(route, { body });
console.log(`Registered ${data.length} commands ${env.devGuildId ? "to dev guild" : "globally"}.`);
```

- [ ] **Step 2: Verify the script loads without a token by expecting a clear env error**

Run: `node src/scripts/register-commands.js`
Expected: exits with an `Invalid environment` error naming the missing vars (proves wiring + env validation; real registration happens once `.env` is filled).

- [ ] **Step 3: Commit**

```bash
git add src/scripts/register-commands.js
git commit -m "feat: add slash command registration script"
```

---

### Task 17: Per-shard bootstrap (`src/bot.js`)

**Files:**
- Create: `src/bot.js`

**Interfaces:**
- Consumes: everything above — `loadEnv`, `createPrisma`, `createLogger`, `ConfigService`, `Cooldowns`, `Scheduler`, `discoverCommands`/`buildCommandMap`, `discoverEvents`/`bindEvents`; discord.js `Client`, `GatewayIntentBits`, `Partials`, `node-cron`.
- Produces: `startBot()` — constructs the client with Phase 1 intents, builds the DI `context`, binds events + the interaction router, logs in. Exported for reuse; also invoked when run directly.

- [ ] **Step 1: Write `src/bot.js`**

```js
import { Client, GatewayIntentBits, Partials } from "discord.js";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import { loadEnv } from "./config/env.js";
import { createPrisma } from "./core/db.js";
import { createLogger } from "./core/Logger.js";
import { ConfigService } from "./core/ConfigService.js";
import { Cooldowns } from "./core/Cooldowns.js";
import { Scheduler } from "./core/Scheduler.js";
import { discoverCommands, buildCommandMap } from "./core/CommandHandler.js";
import { discoverEvents, bindEvents } from "./core/EventHandler.js";

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
    ],
    partials: [Partials.GuildMember, Partials.User],
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
    cooldowns: new Cooldowns(),
    scheduler: new Scheduler({ cron, logger }),
  };

  bindEvents(client, listeners, context);
  client.once("ready", (c) => logger.info(`Logged in as ${c.user.tag} (shard ready)`));

  await client.login(env.token);
  return { client, context };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startBot().catch((err) => {
    console.error("Failed to start bot:", err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Verify it fails cleanly without env**

Run: `node src/bot.js`
Expected: exits with an `Invalid environment` error (proves all imports resolve and wiring is valid without needing a live token).

- [ ] **Step 3: Commit**

```bash
git add src/bot.js
git commit -m "feat: add per-shard client bootstrap with DI context"
```

---

### Task 18: Sharding entrypoint (`src/index.js`) + README

**Files:**
- Create: `src/index.js`
- Create: `README.md`

**Interfaces:**
- Consumes: `loadEnv`; discord.js `ShardingManager`.
- Produces: process entrypoint that spawns shards of `src/bot.js`. `SHARD_COUNT=auto` lets discord.js decide.

- [ ] **Step 1: Write `src/index.js`**

```js
import { ShardingManager } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const botPath = join(dirname(fileURLToPath(import.meta.url)), "bot.js");

const manager = new ShardingManager(botPath, {
  token: env.token,
  totalShards: env.shardCount, // "auto" or a number
});

manager.on("shardCreate", (shard) => console.log(`Launched shard ${shard.id}`));
await manager.spawn();
```

- [ ] **Step 2: Write `README.md`** (setup, intents, invite permissions, scripts)

````markdown
# Discord Bot

Public, multi-server security & moderation bot (Phase 1: foundation).

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`.
3. In the Discord Developer Portal, enable the **Server Members Intent** (privileged). The **Message Content Intent** is only needed later (Phase 2 automod / full message-content logging).
4. `npm run db:migrate` to create tables.
5. `npm run register` to register slash commands (guild-scoped if `DEV_GUILD_ID` is set, else global).
6. `npm start` (sharded) or `npm run dev` (single process, watch mode).

## Invite permissions
Least-privilege set: View Channels, Send Messages, Embed Links, Ban Members, Kick Members,
Moderate Members, Manage Roles, Manage Channels, Manage Webhooks, Manage Server,
Manage Messages, View Audit Log. (Administrator simplifies anti-nuke reliability but is optional.)

## Scripts
- `npm test` — run unit tests (Vitest)
- `npm run lint` / `npm run format`
- `npm run register` — register slash commands
- `npm start` / `npm run dev`

## Status
Phase 1 foundation. Feature modules (anti-nuke, moderation, logging, config, help) land in follow-up plans.
````

- [ ] **Step 3: Run the full test suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all tests PASS; lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/index.js README.md
git commit -m "feat: add sharding entrypoint and README"
```

---

## Self-Review

**Spec coverage (Phase 1 foundation scope):**
- Modular monolith, shard-ready → Tasks 17, 18. ✓
- discord.js v14 + Postgres/Prisma + Zod + pino + node-cron → Tasks 1–3, 7, 14. ✓
- Project structure (§5) → created across Tasks 1–18. ✓
- Data model (§6): Guild, AntinukeConfig, Whitelist, LoggingConfig, ModRole, Case → Task 3. ✓
- Core systems (§4): ConfigService (T9), Command/Event handlers (T12/T13), PermissionService (T10), Cooldowns (T8), Errors (T11), Logger (T7), Scheduler (T14). ✓
- Intents & permissions (§12) → Task 17 intents + Task 18 README. ✓
- Error handling & resilience (§13) → Task 11 + shard isolation via ShardingManager (T18). ✓
- Testing strategy (§14): pure logic unit-tested with injected mocks; anti-nuke decision engine deferred to the anti-nuke plan (its home) — noted, not a gap. ✓
- Feature modules (anti-nuke, moderation, logging, config, help) are explicitly **out of this plan** — they are Plans 2–5. Not a coverage gap.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows complete code; every test step shows real assertions. ✓

**Type consistency:** `context` shape (`{ client, logger, prisma, commands, config, cooldowns, scheduler }`) defined in Task 17 matches its consumers in Task 15 (`ctx.commands`, `ctx.config.getGuild`, `ctx.cooldowns.check`, `ctx.logger`). `ConfigService.getGuild` returns a row with `modRoles` (schema Task 3) consumed in Task 15. `canUseCommand({ member, command, modRoleIds })` signature (T10) matches its call site (T15). `runSafely({ fn, interaction, logger })` (T11) matches its call site (T15). `buildCommandMap`/`toJSON`/`discoverCommands` (T12) match Tasks 16/17. `bindEvents`/`discoverEvents` (T13) match Task 17. `Scheduler.every`/`stopAll` (T14) consistent. ✓
