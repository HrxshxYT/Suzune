# Phase 2d — Leveling / XP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a message-based leveling system — members earn XP for chatting, level up with a current-channel announcement and highest-only role rewards, and view progress via an image `/rank` card, a paginated `/leaderboard`, and an Administrator `/levels` control panel.

**Architecture:** Pure decision/formatting logic (XP curve, award eligibility, level-up detection, reward resolution, rank data) is isolated and unit-tested; Discord/Prisma side-effects are injected. A thin `messageCreate` listener delegates to a testable `processMessageXp` orchestrator. Config lives in a per-guild `LevelingConfig` (cached via `ConfigService`); XP and rewards live in `MemberLevel`/`LevelReward` behind a `LevelingService`. The `/levels` panel reuses `runPanel`; `/leaderboard` reuses `runPager`.

**Tech Stack:** Node.js 25 (ESM), discord.js v14 (`Events`, `SlashCommandBuilder`, `PermissionFlagsBits`, select/button builders), Prisma (`MemberLevel`, `LevelReward`, `LevelingConfig`), `@napi-rs/canvas` (rank card), Vitest.

## Global Constraints

- **Node.js 25**, ES modules only (`import`/`export`); discord.js v14 API surface only.
- **All new code under `src/modules/leveling/`**; commands auto-discovered from `commands/*.js`, events from `events/*.js`. No core loader changes.
- **Reuse, do NOT re-implement:** `ConfigService` (`src/core/ConfigService.js`), `ctx.cooldowns` (`src/core/Cooldowns.js`), `runPanel` (`src/lib/panel.js`), `runPager` + `paginate` (`src/lib/navigator.js` / `src/lib/components.js`), `brandEmbed`/`successEmbed`/`errorEmbed` (`src/lib/embeds.js`), `COLORS`/`EMOJIS` (`src/lib/constants.js`).
- **Lists are stored as `Json @default("[]")`** (the repo does not use Postgres scalar lists) — matches `AutomodConfig.exemptRoles`/`exemptChannels`.
- **No new gateway intent** — XP counts message *events*; `GuildMessages` is already enabled and `MessageContent` is NOT required.
- **Level is derived from XP, never stored.** `MemberLevel.xp` is the single source of truth; the leaderboard sorts by `xp` desc.
- **Never throw out of the `messageCreate` listener** — every Discord side-effect (announce, role add/remove) is individually guarded and logged.
- **Panels:** max 5 action rows per message/view; owner-gated; custom-ids carry an `:<ownerId>` suffix; reply ephemeral. discord.js `ComponentType`: Button=2, StringSelect=3, RoleSelect=6, ChannelSelect=8.
- **No live Postgres in the build env** — generate migration SQL offline; never block pure-logic tasks on a DB.
- **Tests:** Vitest, `*.test.js` under `test/` mirroring `src/`. Run one file with `npx vitest run <path>`.
- **Commit** after each task's tests pass, Conventional Commits (`feat(leveling): ...`, `test(leveling): ...`).
- **Bot display name** is **Joint Jagadeesan** (`BOT_NAME`).

---

### Task 1: Prisma models + ConfigService wiring

**Files:**
- Modify: `prisma/schema.prisma` (add three models + Guild relation)
- Create: `prisma/migrations/20260712000000_leveling/migration.sql`
- Modify: `src/core/ConfigService.js` (add `leveling` to `INCLUDE`, add `updateLeveling`)
- Test: `test/core/ConfigService.leveling.test.js`

**Interfaces:**
- Produces: `ConfigService.updateLeveling(guildId, data) -> Promise<row>`; `getGuild(guildId)` now returns a row with a `.leveling` property (or `null` when unset).
- Produces (schema): `MemberLevel { guildId, userId, xp }`, `LevelReward { guildId, level, roleId }`, `LevelingConfig { guildId, enabled, xpMin, xpMax, cooldownSec, announce, ignoredChannels, ignoredRoles }`.

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

Append these models and add the `leveling` relation line to `model Guild`:

```prisma
model Guild {
  // ...existing fields...
  leveling      LevelingConfig?
}

model LevelingConfig {
  guildId         String  @id
  guild           Guild   @relation(fields: [guildId], references: [id], onDelete: Cascade)
  enabled         Boolean @default(false)
  xpMin           Int     @default(15)
  xpMax           Int     @default(25)
  cooldownSec     Int     @default(60)
  announce        Boolean @default(true)
  ignoredChannels Json    @default("[]")
  ignoredRoles    Json    @default("[]")
}

model MemberLevel {
  guildId String
  userId  String
  xp      Int    @default(0)

  @@id([guildId, userId])
  @@index([guildId, xp])
}

model LevelReward {
  guildId String
  level   Int
  roleId  String

  @@id([guildId, level])
}
```

(Only add the single `leveling LevelingConfig?` line inside the existing `Guild` block — leave its other relations untouched.)

- [ ] **Step 2: Generate the migration SQL offline**

Run:
```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260712000000_leveling/migration.sql
```
(Create the directory first if needed: `mkdir -p prisma/migrations/20260712000000_leveling`.)
Expected: a `migration.sql` containing `CREATE TABLE "LevelingConfig"`, `"MemberLevel"`, `"LevelReward"`.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" — `prisma.levelingConfig`, `prisma.memberLevel`, `prisma.levelReward` now exist.

- [ ] **Step 4: Write the failing ConfigService test**

Create `test/core/ConfigService.leveling.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function fakePrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", leveling: null })),
      create: vi.fn(async () => ({ id: "g1", leveling: null })),
    },
    levelingConfig: { upsert: vi.fn(async (args) => ({ guildId: "g1", ...args.create, ...args.update })) },
  };
}

describe("ConfigService.updateLeveling", () => {
  it("upserts the leveling config and invalidates the cache", async () => {
    const prisma = fakePrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1"); // populate cache
    await svc.updateLeveling("g1", { enabled: true, xpMin: 20 });
    expect(prisma.levelingConfig.upsert).toHaveBeenCalledWith({
      where: { guildId: "g1" },
      create: { guildId: "g1", enabled: true, xpMin: 20 },
      update: { enabled: true, xpMin: 20 },
    });
    expect(svc.cache.has("g1")).toBe(false); // invalidated
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run test/core/ConfigService.leveling.test.js`
Expected: FAIL — `svc.updateLeveling is not a function`.

- [ ] **Step 6: Wire ConfigService**

In `src/core/ConfigService.js`, add `leveling: true,` to the `INCLUDE` object, and add this method alongside the other `update*` methods (mirroring `updateAutomod`):
```js
  async updateLeveling(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.levelingConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run test/core/ConfigService.leveling.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260712000000_leveling src/core/ConfigService.js test/core/ConfigService.leveling.test.js
git commit -m "feat(leveling): add LevelingConfig/MemberLevel/LevelReward models + ConfigService.updateLeveling"
```

---

### Task 2: XP curve (pure)

**Files:**
- Create: `src/modules/leveling/curve.js`
- Test: `test/modules/leveling/curve.test.js`

**Interfaces:**
- Produces: `xpForLevel(level) -> number` (cumulative XP to *reach* `level`; `xpForLevel(0) === 0`), `levelForXp(xp) -> number`, `progress(xp) -> { level, xpIntoLevel, xpForNext, percent }`.
- Cost to go from level `L` to `L+1` is `5*L*L + 50*L + 100`.

- [ ] **Step 1: Write the failing test**

Create `test/modules/leveling/curve.test.js`:
```js
import { describe, it, expect } from "vitest";
import { xpForLevel, levelForXp, progress } from "../../../src/modules/leveling/curve.js";

describe("xp curve", () => {
  it("xpForLevel is cumulative and starts at 0", () => {
    // cost(0)=100, cost(1)=155, cost(2)=220
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(255); // 100 + 155
    expect(xpForLevel(3)).toBe(475); // 255 + 220
  });

  it("levelForXp is the inverse (highest threshold <= xp)", () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(99)).toBe(0);
    expect(levelForXp(100)).toBe(1);
    expect(levelForXp(254)).toBe(1);
    expect(levelForXp(255)).toBe(2);
  });

  it("progress reports position within the current level", () => {
    const p = progress(150);
    expect(p.level).toBe(1);
    expect(p.xpIntoLevel).toBe(50);   // 150 - xpForLevel(1)=100
    expect(p.xpForNext).toBe(155);    // cost(1)
    expect(p.percent).toBeCloseTo(50 / 155, 5);
  });
});
```
Note: `cost(2) = 5*4 + 50*2 + 100 = 20 + 100 + 100 = 220`, so `xpForLevel(3) = 255 + 220 = 475`. Fix the first test's third assertion to `expect(xpForLevel(3)).toBe(475);`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/modules/leveling/curve.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `curve.js`**

Create `src/modules/leveling/curve.js`:
```js
// XP to advance from level L to L+1 (MEE6-style).
function cost(level) {
  return 5 * level * level + 50 * level + 100;
}

// Cumulative XP required to *reach* `level`. xpForLevel(0) === 0.
export function xpForLevel(level) {
  let total = 0;
  for (let l = 0; l < level; l++) total += cost(l);
  return total;
}

// Highest level whose threshold is <= xp.
export function levelForXp(xp) {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function progress(xp) {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const xpForNext = cost(level);
  const xpIntoLevel = xp - base;
  return { level, xpIntoLevel, xpForNext, percent: xpIntoLevel / xpForNext };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/modules/leveling/curve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leveling/curve.js test/modules/leveling/curve.test.js
git commit -m "feat(leveling): add MEE6-style xp curve helpers"
```

---

### Task 3: Award eligibility, level-up detection, reward resolution (pure)

**Files:**
- Create: `src/modules/leveling/award.js`
- Create: `src/modules/leveling/rewards.js`
- Test: `test/modules/leveling/award.test.js`
- Test: `test/modules/leveling/rewards.test.js`

**Interfaces:**
- Produces (`award.js`): `shouldAward({ authorBot, inGuild, config, memberRoleIds, channelId }) -> boolean`; `randomXp(min, max, rng = Math.random) -> number` (integer in `[min, max]`); `detectLevelUp(oldXp, newXp) -> { leveledUp, oldLevel, newLevel }`.
- Produces (`rewards.js`): `resolveRewards({ level, rewards, currentRoleIds }) -> { add: string[], remove: string[] }`, where `rewards` is `Array<{ level: number, roleId: string }>`.

- [ ] **Step 1: Write the failing `award` test**

Create `test/modules/leveling/award.test.js`:
```js
import { describe, it, expect } from "vitest";
import { shouldAward, randomXp, detectLevelUp } from "../../../src/modules/leveling/award.js";

const cfg = (over = {}) => ({ enabled: true, ignoredChannels: [], ignoredRoles: [], ...over });

describe("shouldAward", () => {
  it("awards a normal human message in an enabled guild", () => {
    expect(shouldAward({ authorBot: false, inGuild: true, config: cfg(), memberRoleIds: ["r1"], channelId: "c1" })).toBe(true);
  });
  it("rejects bots, DMs, and disabled config", () => {
    expect(shouldAward({ authorBot: true, inGuild: true, config: cfg(), memberRoleIds: [], channelId: "c1" })).toBe(false);
    expect(shouldAward({ authorBot: false, inGuild: false, config: cfg(), memberRoleIds: [], channelId: "c1" })).toBe(false);
    expect(shouldAward({ authorBot: false, inGuild: true, config: cfg({ enabled: false }), memberRoleIds: [], channelId: "c1" })).toBe(false);
    expect(shouldAward({ authorBot: false, inGuild: true, config: null, memberRoleIds: [], channelId: "c1" })).toBe(false);
  });
  it("rejects ignored channels and ignored roles", () => {
    expect(shouldAward({ authorBot: false, inGuild: true, config: cfg({ ignoredChannels: ["c1"] }), memberRoleIds: [], channelId: "c1" })).toBe(false);
    expect(shouldAward({ authorBot: false, inGuild: true, config: cfg({ ignoredRoles: ["r9"] }), memberRoleIds: ["r9"], channelId: "c1" })).toBe(false);
  });
});

describe("randomXp", () => {
  it("returns an integer within [min, max]", () => {
    expect(randomXp(15, 25, () => 0)).toBe(15);
    expect(randomXp(15, 25, () => 0.999999)).toBe(25);
    expect(randomXp(15, 25, () => 0.5)).toBe(20);
  });
});

describe("detectLevelUp", () => {
  it("flags a crossing of a level threshold", () => {
    expect(detectLevelUp(99, 100)).toEqual({ leveledUp: true, oldLevel: 0, newLevel: 1 });
    expect(detectLevelUp(100, 120)).toEqual({ leveledUp: false, oldLevel: 1, newLevel: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/award.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `award.js`**

Create `src/modules/leveling/award.js`:
```js
import { levelForXp } from "./curve.js";

export function shouldAward({ authorBot, inGuild, config, memberRoleIds = [], channelId }) {
  if (authorBot || !inGuild || !config?.enabled) return false;
  const ignoredChannels = config.ignoredChannels ?? [];
  const ignoredRoles = config.ignoredRoles ?? [];
  if (ignoredChannels.includes(channelId)) return false;
  if (memberRoleIds.some((r) => ignoredRoles.includes(r))) return false;
  return true;
}

export function randomXp(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function detectLevelUp(oldXp, newXp) {
  const oldLevel = levelForXp(oldXp);
  const newLevel = levelForXp(newXp);
  return { leveledUp: newLevel > oldLevel, oldLevel, newLevel };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/award.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing `rewards` test**

Create `test/modules/leveling/rewards.test.js`:
```js
import { describe, it, expect } from "vitest";
import { resolveRewards } from "../../../src/modules/leveling/rewards.js";

const rewards = [
  { level: 5, roleId: "r5" },
  { level: 10, roleId: "r10" },
  { level: 20, roleId: "r20" },
];

describe("resolveRewards (highest-only)", () => {
  it("adds the highest earned tier and removes lower tiers held", () => {
    const out = resolveRewards({ level: 12, rewards, currentRoleIds: ["r5", "other"] });
    expect(out.add).toEqual(["r10"]);
    expect(out.remove).toEqual(["r5"]);
  });
  it("adds nothing new when the correct tier is already held", () => {
    const out = resolveRewards({ level: 12, rewards, currentRoleIds: ["r10"] });
    expect(out.add).toEqual([]);
    expect(out.remove).toEqual([]);
  });
  it("returns empty when no tier is earned yet", () => {
    const out = resolveRewards({ level: 3, rewards, currentRoleIds: [] });
    expect(out.add).toEqual([]);
    expect(out.remove).toEqual([]);
  });
  it("removes a now-too-low tier the member still holds", () => {
    const out = resolveRewards({ level: 25, rewards, currentRoleIds: ["r5", "r10", "r20"] });
    expect(out.add).toEqual([]);
    expect(out.remove).toEqual(["r5", "r10"]);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/rewards.test.js`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `rewards.js`**

Create `src/modules/leveling/rewards.js`:
```js
// Highest-only: grant the reward for the highest level <= `level`, and remove any
// other reward roles the member currently holds.
export function resolveRewards({ level, rewards, currentRoleIds = [] }) {
  const earned = rewards
    .filter((r) => r.level <= level)
    .sort((a, b) => b.level - a.level);
  const target = earned[0]?.roleId ?? null;

  const rewardRoleIds = new Set(rewards.map((r) => r.roleId));
  const remove = currentRoleIds.filter((id) => rewardRoleIds.has(id) && id !== target);
  const add = target && !currentRoleIds.includes(target) ? [target] : [];
  return { add, remove };
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/rewards.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/leveling/award.js src/modules/leveling/rewards.js test/modules/leveling/award.test.js test/modules/leveling/rewards.test.js
git commit -m "feat(leveling): add award eligibility, level-up detection, and reward resolution"
```

---

### Task 4: LevelingService (DB access) + bot.js wiring

**Files:**
- Create: `src/modules/leveling/LevelingService.js`
- Modify: `src/bot.js` (import + add `leveling` to the DI context)
- Test: `test/modules/leveling/LevelingService.test.js`

**Interfaces:**
- Produces: `new LevelingService(prisma)` with:
  - `addXp(guildId, userId, amount) -> Promise<{ oldXp, newXp }>`
  - `getXp(guildId, userId) -> Promise<number>`
  - `rankOf(guildId, userId) -> Promise<number>` (1-based)
  - `leaderboard(guildId, limit) -> Promise<Array<{ userId, xp }>>`
  - `getRewards(guildId) -> Promise<Array<{ level, roleId }>>`
  - `addReward(guildId, level, roleId) -> Promise<void>`
  - `removeReward(guildId, level) -> Promise<void>`
- Consumes: `ctx.leveling` is available to later tasks (events, commands, panel).

- [ ] **Step 1: Write the failing test**

Create `test/modules/leveling/LevelingService.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { LevelingService } from "../../../src/modules/leveling/LevelingService.js";

describe("LevelingService", () => {
  it("addXp upserts and returns old/new totals", async () => {
    const prisma = {
      memberLevel: {
        findUnique: vi.fn(async () => ({ xp: 40 })),
        upsert: vi.fn(async () => ({ xp: 60 })),
      },
    };
    const svc = new LevelingService(prisma);
    const out = await svc.addXp("g1", "u1", 20);
    expect(out).toEqual({ oldXp: 40, newXp: 60 });
    expect(prisma.memberLevel.upsert).toHaveBeenCalledWith({
      where: { guildId_userId: { guildId: "g1", userId: "u1" } },
      create: { guildId: "g1", userId: "u1", xp: 20 },
      update: { xp: { increment: 20 } },
    });
  });

  it("addXp treats a missing row as 0 old xp", async () => {
    const prisma = {
      memberLevel: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({ xp: 20 })),
      },
    };
    const svc = new LevelingService(prisma);
    expect(await svc.addXp("g1", "u1", 20)).toEqual({ oldXp: 0, newXp: 20 });
  });

  it("rankOf counts members with strictly more xp, plus one", async () => {
    const prisma = {
      memberLevel: {
        findUnique: vi.fn(async () => ({ xp: 100 })),
        count: vi.fn(async () => 3),
      },
    };
    const svc = new LevelingService(prisma);
    expect(await svc.rankOf("g1", "u1")).toBe(4);
    expect(prisma.memberLevel.count).toHaveBeenCalledWith({
      where: { guildId: "g1", xp: { gt: 100 } },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/LevelingService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LevelingService.js`**

Create `src/modules/leveling/LevelingService.js`:
```js
export class LevelingService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async addXp(guildId, userId, amount) {
    const existing = await this.prisma.memberLevel.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    const oldXp = existing?.xp ?? 0;
    const row = await this.prisma.memberLevel.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, xp: amount },
      update: { xp: { increment: amount } },
    });
    return { oldXp, newXp: row.xp };
  }

  async getXp(guildId, userId) {
    const row = await this.prisma.memberLevel.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    return row?.xp ?? 0;
  }

  async rankOf(guildId, userId) {
    const xp = await this.getXp(guildId, userId);
    const ahead = await this.prisma.memberLevel.count({
      where: { guildId, xp: { gt: xp } },
    });
    return ahead + 1;
  }

  async leaderboard(guildId, limit) {
    return this.prisma.memberLevel.findMany({
      where: { guildId },
      orderBy: { xp: "desc" },
      take: limit,
    });
  }

  async getRewards(guildId) {
    return this.prisma.levelReward.findMany({
      where: { guildId },
      orderBy: { level: "asc" },
    });
  }

  async addReward(guildId, level, roleId) {
    await this.prisma.levelReward.upsert({
      where: { guildId_level: { guildId, level } },
      create: { guildId, level, roleId },
      update: { roleId },
    });
  }

  async removeReward(guildId, level) {
    await this.prisma.levelReward.deleteMany({ where: { guildId, level } });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/LevelingService.test.js`
Expected: PASS.

- [ ] **Step 5: Wire into `src/bot.js`**

Add the import near the other module-service imports:
```js
import { LevelingService } from "./modules/leveling/LevelingService.js";
```
Add to the `context` object (alongside `reactionRoles: ...`):
```js
    leveling: new LevelingService(prisma),
```

- [ ] **Step 6: Verify the suite still loads**

Run: `npx vitest run test/smoke.test.js test/modules/leveling/LevelingService.test.js`
Expected: PASS (bot wiring imports resolve).

- [ ] **Step 7: Commit**

```bash
git add src/modules/leveling/LevelingService.js src/bot.js test/modules/leveling/LevelingService.test.js
git commit -m "feat(leveling): add LevelingService and wire it into the DI context"
```

---

### Task 5: XP accrual orchestrator + messageCreate listener

**Files:**
- Create: `src/modules/leveling/accrual.js`
- Create: `src/modules/leveling/events/messageCreate.js`
- Test: `test/modules/leveling/accrual.test.js`

**Interfaces:**
- Consumes: `shouldAward`, `randomXp`, `detectLevelUp` (`award.js`); `resolveRewards` (`rewards.js`); `LevelingService`; `ctx.cooldowns.check`.
- Produces: `processMessageXp({ message, config, service, cooldowns, rng, logger }) -> Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `test/modules/leveling/accrual.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { processMessageXp } from "../../../src/modules/leveling/accrual.js";

function fakeMessage({ roles = [] } = {}) {
  const send = vi.fn(async () => {});
  const add = vi.fn(async () => {});
  const remove = vi.fn(async () => {});
  return {
    guild: { id: "g1" },
    guildId: "g1",
    author: { id: "u1", bot: false },
    channelId: "c1",
    channel: { send },
    member: { roles: { cache: new Map(roles.map((r) => [r, {}])), add, remove } },
    _spies: { send, add, remove },
  };
}

const config = (over = {}) => ({ enabled: true, xpMin: 15, xpMax: 25, cooldownSec: 60, announce: true, ignoredChannels: [], ignoredRoles: [], ...over });

function fakeService({ oldXp = 90, newXp = 110, rewards = [] } = {}) {
  return {
    addXp: vi.fn(async () => ({ oldXp, newXp })),
    getRewards: vi.fn(async () => rewards),
  };
}

const cooldowns = (limited = false) => ({ check: vi.fn(() => ({ limited })) });
const logger = { error: vi.fn(), warn: vi.fn() };

describe("processMessageXp", () => {
  it("skips when the cooldown limits the user", async () => {
    const message = fakeMessage();
    const service = fakeService();
    await processMessageXp({ message, config: config(), service, cooldowns: cooldowns(true), rng: () => 0, logger });
    expect(service.addXp).not.toHaveBeenCalled();
  });

  it("skips ineligible messages (ignored channel) without touching the cooldown", async () => {
    const message = fakeMessage();
    const service = fakeService();
    const cd = cooldowns(false);
    await processMessageXp({ message, config: config({ ignoredChannels: ["c1"] }), service, cooldowns: cd, rng: () => 0, logger });
    expect(cd.check).not.toHaveBeenCalled();
    expect(service.addXp).not.toHaveBeenCalled();
  });

  it("awards xp and announces + applies rewards on level-up", async () => {
    const message = fakeMessage({ roles: ["r5"] });
    const service = fakeService({ oldXp: 90, newXp: 110, rewards: [{ level: 1, roleId: "r10" }, { level: 5, roleId: "r5" }] });
    await processMessageXp({ message, config: config(), service, cooldowns: cooldowns(false), rng: () => 0, logger });
    expect(service.addXp).toHaveBeenCalledWith("g1", "u1", 15); // rng 0 -> xpMin
    expect(message._spies.send).toHaveBeenCalledTimes(1); // announced level-up (90->110 crosses level 1 at 100)
    expect(message._spies.add).toHaveBeenCalledWith("r10");
    expect(message._spies.remove).toHaveBeenCalledWith("r5");
  });

  it("does not announce when announce is off, but still awards xp", async () => {
    const message = fakeMessage();
    const service = fakeService({ oldXp: 90, newXp: 110, rewards: [] });
    await processMessageXp({ message, config: config({ announce: false }), service, cooldowns: cooldowns(false), rng: () => 0, logger });
    expect(service.addXp).toHaveBeenCalled();
    expect(message._spies.send).not.toHaveBeenCalled();
  });

  it("does not throw when announce send fails", async () => {
    const message = fakeMessage();
    message.channel.send = vi.fn(async () => { throw new Error("no perms"); });
    const service = fakeService({ oldXp: 90, newXp: 110, rewards: [] });
    await expect(
      processMessageXp({ message, config: config(), service, cooldowns: cooldowns(false), rng: () => 0, logger }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/accrual.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `accrual.js`**

Create `src/modules/leveling/accrual.js`:
```js
import { shouldAward, randomXp, detectLevelUp } from "./award.js";
import { resolveRewards } from "./rewards.js";

// Orchestrates one message's XP award. All side-effects (DB, announce, roles) are
// injected/guarded so this never throws out of the listener.
export async function processMessageXp({ message, config, service, cooldowns, rng = Math.random, logger }) {
  const memberRoleIds = [...(message.member?.roles?.cache?.keys?.() ?? [])];
  if (!shouldAward({
    authorBot: message.author?.bot ?? false,
    inGuild: Boolean(message.guild),
    config,
    memberRoleIds,
    channelId: message.channelId,
  })) return;

  const cd = cooldowns.check(`xp:${message.guildId}`, message.author.id, config.cooldownSec);
  if (cd.limited) return;

  const amount = randomXp(config.xpMin, config.xpMax, rng);
  const { oldXp, newXp } = await service.addXp(message.guildId, message.author.id, amount);
  const { leveledUp, newLevel } = detectLevelUp(oldXp, newXp);
  if (!leveledUp) return;

  if (config.announce) {
    try {
      await message.channel.send(
        `🎉 <@${message.author.id}> reached **level ${newLevel}**!`,
      );
    } catch (err) {
      logger?.error({ err }, "level-up announce failed");
    }
  }

  await applyRewards({ message, service, newLevel, logger });
}

async function applyRewards({ message, service, newLevel, logger }) {
  const member = message.member;
  if (!member) return;
  let rewards;
  try {
    rewards = await service.getRewards(message.guildId);
  } catch (err) {
    logger?.error({ err }, "level reward lookup failed");
    return;
  }
  if (!rewards.length) return;

  const currentRoleIds = [...member.roles.cache.keys()];
  const { add, remove } = resolveRewards({ level: newLevel, rewards, currentRoleIds });
  for (const roleId of add) {
    try { await member.roles.add(roleId); } catch (err) { logger?.error({ err, roleId }, "reward add failed"); }
  }
  for (const roleId of remove) {
    try { await member.roles.remove(roleId); } catch (err) { logger?.error({ err, roleId }, "reward remove failed"); }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/accrual.test.js`
Expected: PASS.

- [ ] **Step 5: Create the thin listener**

Create `src/modules/leveling/events/messageCreate.js`:
```js
import { Events } from "discord.js";
import { processMessageXp } from "../accrual.js";

export default {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || message.author?.bot) return;
    const guildConfig = await ctx.config.getGuild(message.guild.id);
    const config = guildConfig.leveling;
    if (!config?.enabled) return;

    await processMessageXp({
      message,
      config,
      service: ctx.leveling,
      cooldowns: ctx.cooldowns,
      logger: ctx.logger,
    });
  },
};
```

- [ ] **Step 6: Run the whole leveling suite**

Run: `npx vitest run test/modules/leveling`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/leveling/accrual.js src/modules/leveling/events/messageCreate.js test/modules/leveling/accrual.test.js
git commit -m "feat(leveling): award xp on messages with level-up announce + rewards"
```

---

### Task 6: Rank data + image card + `/rank` command

**Files:**
- Modify: `package.json` (add `@napi-rs/canvas` dependency)
- Create: `src/modules/leveling/assets/DejaVuSans.ttf` (bundled font)
- Create: `src/modules/leveling/rankData.js`
- Create: `src/modules/leveling/card.js`
- Create: `src/modules/leveling/commands/rank.js`
- Test: `test/modules/leveling/rankData.test.js`
- Test: `test/modules/leveling/card.test.js`

**Interfaces:**
- Produces: `buildRankData({ xp, rank }) -> { level, rank, xp, xpIntoLevel, xpForNext, percent }`.
- Produces: `buildRankCard({ username, avatarPng, level, rank, xpIntoLevel, xpForNext, percent }) -> Promise<Buffer>` (PNG).
- Consumes: `progress` (`curve.js`); `LevelingService.getXp`/`rankOf`.

- [ ] **Step 1: Add the canvas dependency and a bundled font**

Run:
```bash
npm install @napi-rs/canvas
mkdir -p src/modules/leveling/assets
curl -L -o src/modules/leveling/assets/DejaVuSans.ttf \
  https://github.com/dejavu-fonts/dejavu-fonts/raw/version_2_37/ttf/DejaVuSans.ttf
```
Expected: `@napi-rs/canvas` in `package.json` dependencies; a ~700KB `DejaVuSans.ttf` present. (DejaVu is a permissive, freely-redistributable font. If the download is unavailable, copy any `.ttf` you may redistribute to that path.)

- [ ] **Step 2: Write the failing `rankData` test**

Create `test/modules/leveling/rankData.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildRankData } from "../../../src/modules/leveling/rankData.js";

describe("buildRankData", () => {
  it("derives level/progress from xp and passes rank through", () => {
    const d = buildRankData({ xp: 150, rank: 4 });
    expect(d.level).toBe(1);
    expect(d.rank).toBe(4);
    expect(d.xp).toBe(150);
    expect(d.xpIntoLevel).toBe(50);
    expect(d.xpForNext).toBe(155);
    expect(d.percent).toBeCloseTo(50 / 155, 5);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/rankData.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `rankData.js`**

Create `src/modules/leveling/rankData.js`:
```js
import { progress } from "./curve.js";

export function buildRankData({ xp, rank }) {
  const p = progress(xp);
  return {
    level: p.level,
    rank,
    xp,
    xpIntoLevel: p.xpIntoLevel,
    xpForNext: p.xpForNext,
    percent: p.percent,
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/rankData.test.js`
Expected: PASS.

- [ ] **Step 6: Write the failing `card` smoke test**

Create `test/modules/leveling/card.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildRankCard } from "../../../src/modules/leveling/card.js";

describe("buildRankCard", () => {
  it("renders a non-empty PNG buffer", async () => {
    const buf = await buildRankCard({
      username: "tester",
      avatarPng: null,
      level: 3,
      rank: 7,
      xpIntoLevel: 40,
      xpForNext: 200,
      percent: 0.2,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG"); // PNG signature
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/card.test.js`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `card.js`**

Create `src/modules/leveling/card.js`:
```js
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fontPath = join(dirname(fileURLToPath(import.meta.url)), "assets", "DejaVuSans.ttf");
GlobalFonts.registerFromPath(fontPath, "RankSans");

const W = 900;
const H = 260;

export async function buildRankCard({ username, avatarPng, level, rank, xpIntoLevel, xpForNext, percent }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#1f2724";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(0, 0, 10, H);

  // Avatar (optional)
  if (avatarPng) {
    try {
      const img = await loadImage(avatarPng);
      ctx.save();
      ctx.beginPath();
      ctx.arc(140, 130, 90, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 50, 40, 180, 180);
      ctx.restore();
    } catch {
      // ignore avatar failures; card still renders
    }
  }

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "42px RankSans";
  ctx.fillText(username, 270, 90);

  ctx.font = "28px RankSans";
  ctx.fillStyle = "#9fb3ab";
  ctx.fillText(`Rank #${rank}`, 270, 135);
  ctx.fillText(`Level ${level}`, 430, 135);

  // Progress bar
  const barX = 270, barY = 170, barW = 580, barH = 40;
  ctx.fillStyle = "#2b352f";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(barX, barY, Math.max(0, Math.min(1, percent)) * barW, barH);

  ctx.fillStyle = "#ffffff";
  ctx.font = "24px RankSans";
  ctx.fillText(`${xpIntoLevel} / ${xpForNext} XP`, barX + 10, barY + 28);

  return canvas.toBuffer("image/png");
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/card.test.js`
Expected: PASS.

- [ ] **Step 10: Implement the `/rank` command**

Create `src/modules/leveling/commands/rank.js`:
```js
import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { buildRankData } from "../rankData.js";
import { buildRankCard } from "../card.js";

async function fetchAvatarPng(user) {
  const url = user.displayAvatarURL({ extension: "png", size: 256 });
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your (or someone's) level and XP.")
    .addUserOption((o) => o.setName("user").setDescription("The user (defaults to you)")),
  permissions: [],
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const user = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId;

    const [xp, rank] = await Promise.all([
      ctx.leveling.getXp(guildId, user.id),
      ctx.leveling.rankOf(guildId, user.id),
    ]);
    const data = buildRankData({ xp, rank });
    const avatarPng = await fetchAvatarPng(user);
    const png = await buildRankCard({ username: user.username, avatarPng, ...data });

    const file = new AttachmentBuilder(png, { name: "rank.png" });
    await interaction.editReply({ files: [file] });
  },
};
```

- [ ] **Step 11: Verify commands still register (JSON valid)**

Run:
```bash
node --input-type=module -e "import r from './src/modules/leveling/commands/rank.js'; console.log(JSON.stringify(r.data.toJSON()).slice(0,80));"
```
Expected: prints a JSON payload containing `"name":"rank"` with no error.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/modules/leveling/assets src/modules/leveling/rankData.js src/modules/leveling/card.js src/modules/leveling/commands/rank.js test/modules/leveling/rankData.test.js test/modules/leveling/card.test.js
git commit -m "feat(leveling): add /rank image card"
```

---

### Task 7: `/leaderboard` command

**Files:**
- Create: `src/modules/leveling/leaderboardEmbed.js`
- Create: `src/modules/leveling/commands/leaderboard.js`
- Test: `test/modules/leveling/leaderboardEmbed.test.js`

**Interfaces:**
- Produces: `buildLevelLeaderboardEmbed(entries, page, pageSize) -> EmbedBuilder`, where `entries` is `Array<{ userId, xp }>`.
- Consumes: `LevelingService.leaderboard`; `paginate`, `runPager`; `levelForXp` (`curve.js`).

- [ ] **Step 1: Write the failing test**

Create `test/modules/leveling/leaderboardEmbed.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildLevelLeaderboardEmbed } from "../../../src/modules/leveling/leaderboardEmbed.js";

describe("buildLevelLeaderboardEmbed", () => {
  it("numbers entries by page offset and shows level + xp", () => {
    const entries = [
      { userId: "u1", xp: 300 },
      { userId: "u2", xp: 100 },
    ];
    const embed = buildLevelLeaderboardEmbed(entries, 0, 10);
    const json = JSON.stringify(embed.data);
    expect(json).toContain("#1");
    expect(json).toContain("<@u1>");
    expect(json).toContain("300");
  });

  it("continues numbering on later pages", () => {
    const embed = buildLevelLeaderboardEmbed([{ userId: "u11", xp: 5 }], 1, 10);
    expect(JSON.stringify(embed.data)).toContain("#11");
  });

  it("renders an empty-state description when there are no entries", () => {
    const embed = buildLevelLeaderboardEmbed([], 0, 10);
    expect(JSON.stringify(embed.data)).toContain("No one has earned XP");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/leaderboardEmbed.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `leaderboardEmbed.js`**

Create `src/modules/leveling/leaderboardEmbed.js`:
```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { levelForXp } from "./curve.js";

export function buildLevelLeaderboardEmbed(entries, page, pageSize) {
  const embed = new EmbedBuilder().setColor(COLORS.brand).setTitle("🏆 XP Leaderboard");

  if (!entries.length) {
    return embed.setDescription("No one has earned XP yet.");
  }

  const lines = entries.map((e, i) => {
    const rank = page * pageSize + i + 1;
    return `**#${rank}** <@${e.userId}> — level ${levelForXp(e.xp)} · ${e.xp} XP`;
  });
  return embed.setDescription(lines.join("\n"));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/leaderboardEmbed.test.js`
Expected: PASS.

- [ ] **Step 5: Implement the `/leaderboard` command**

Create `src/modules/leveling/commands/leaderboard.js`:
```js
import { SlashCommandBuilder } from "discord.js";
import { paginate } from "../../../lib/components.js";
import { runPager } from "../../../lib/navigator.js";
import { buildLevelLeaderboardEmbed } from "../leaderboardEmbed.js";

const PAGE_SIZE = 10;

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the server XP leaderboard."),
  permissions: [],
  async execute(interaction, ctx) {
    const board = await ctx.leveling.leaderboard(interaction.guildId, 100);
    const pages = paginate(board, PAGE_SIZE);
    await runPager({
      interaction,
      count: Math.max(1, pages.length),
      render: (page) => buildLevelLeaderboardEmbed(pages[page] ?? [], page, PAGE_SIZE),
      ownerId: interaction.user.id,
      awaitFn: ctx?.awaitFn,
    });
  },
};
```

- [ ] **Step 6: Verify command JSON is valid**

Run:
```bash
node --input-type=module -e "import c from './src/modules/leveling/commands/leaderboard.js'; console.log(JSON.stringify(c.data.toJSON()).slice(0,80));"
```
Expected: prints a JSON payload containing `"name":"leaderboard"`.

- [ ] **Step 7: Commit**

```bash
git add src/modules/leveling/leaderboardEmbed.js src/modules/leveling/commands/leaderboard.js test/modules/leveling/leaderboardEmbed.test.js
git commit -m "feat(leveling): add /leaderboard with pager"
```

---

### Task 8: `/levels` panel — render (pure)

**Files:**
- Create: `src/modules/leveling/panel/render.js`
- Test: `test/modules/leveling/panelRender.test.js`

**Interfaces:**
- Produces: `buildMainView(state) -> { embeds, components }`, `buildRewardsView(state) -> { embeds, components }`.
- `state` shape: `{ guildId, ownerId, view: "main"|"rewards", leveling: {...config}, rewards: Array<{level, roleId}>, pendingRoleId: string|null }`.
- Custom-id scheme (consumed by Task 9): `lv:tog:<field>:<owner>`, `lv:xp:<owner>` (button→modal), `lv:rewards:<owner>` (open), `lv:back:<owner>`, `lv:close:<owner>`, `lv:ign:channels:<owner>` (channel select), `lv:ign:roles:<owner>` (role select), `lv:rw:role:<owner>` (role select), `lv:rw:level:<owner>` (string select), `lv:rw:remove:<owner>` (string select).

- [ ] **Step 1: Write the failing test**

Create `test/modules/leveling/panelRender.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildMainView, buildRewardsView } from "../../../src/modules/leveling/panel/render.js";

const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  view: "main",
  leveling: { enabled: true, announce: true, xpMin: 15, xpMax: 25, cooldownSec: 60, ignoredChannels: [], ignoredRoles: [] },
  rewards: [{ level: 5, roleId: "r5" }],
  pendingRoleId: null,
  ...over,
});

describe("buildMainView", () => {
  it("exposes the toggle/xp/rewards/close controls", () => {
    const ids = buildMainView(state()).components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("lv:tog:enabled:o1");
    expect(ids).toContain("lv:tog:announce:o1");
    expect(ids).toContain("lv:xp:o1");
    expect(ids).toContain("lv:rewards:o1");
    expect(ids).toContain("lv:ign:channels:o1");
    expect(ids).toContain("lv:ign:roles:o1");
    expect(ids).toContain("lv:close:o1");
  });

  it("shows the enabled toggle green (Success=3) when on", () => {
    const btn = buildMainView(state()).components[0].components[0];
    expect(btn.data.style).toBe(3);
  });
});

describe("buildRewardsView", () => {
  it("offers role/level/remove selects and back/close", () => {
    const ids = buildRewardsView(state({ view: "rewards" })).components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("lv:rw:role:o1");
    expect(ids).toContain("lv:rw:level:o1");
    expect(ids).toContain("lv:rw:remove:o1");
    expect(ids).toContain("lv:back:o1");
  });

  it("omits the remove select when there are no rewards", () => {
    const ids = buildRewardsView(state({ view: "rewards", rewards: [] })).components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).not.toContain("lv:rw:remove:o1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/panelRender.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `panel/render.js`**

Create `src/modules/leveling/panel/render.js`:
```js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";

const REWARD_LEVELS = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50];

export function buildMainView(state) {
  const a = state.leveling;
  const o = state.ownerId;

  const embed = new EmbedBuilder()
    .setColor(a.enabled ? COLORS.success : COLORS.warn)
    .setTitle("⭐ Leveling Control Panel")
    .setDescription(
      `${a.enabled ? "🟢 ON" : "🔴 OFF"} · Announce: ${a.announce ? "on" : "off"}\n` +
        `XP per message: **${a.xpMin}–${a.xpMax}** every **${a.cooldownSec}s**\n` +
        `Ignored: ${(a.ignoredChannels ?? []).length} channels · ${(a.ignoredRoles ?? []).length} roles · ` +
        `Rewards: ${state.rewards.length}`,
    );

  const toggle = (field, label) =>
    new ButtonBuilder()
      .setCustomId(`lv:tog:${field}:${o}`)
      .setLabel(`${a[field] ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(a[field] ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    toggle("enabled", "Enabled"),
    toggle("announce", "Announce"),
    new ButtonBuilder().setCustomId(`lv:xp:${o}`).setLabel("XP settings…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`lv:rewards:${o}`).setLabel("Rewards…").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`lv:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`lv:ign:channels:${o}`)
      .setPlaceholder("Ignored channels (no XP)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(0)
      .setMaxValues(25),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`lv:ign:roles:${o}`)
      .setPlaceholder("Ignored roles (no XP)")
      .setMinValues(0)
      .setMaxValues(25),
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

export function buildRewardsView(state) {
  const o = state.ownerId;
  const pending = state.pendingRoleId;

  const lines = state.rewards.length
    ? state.rewards.map((r) => `Level **${r.level}** → <@&${r.roleId}>`).join("\n")
    : "*No rewards yet.*";

  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle("⭐ Leveling · Role Rewards")
    .setDescription(
      `${lines}\n\n` +
        (pending
          ? `Selected role <@&${pending}> — now pick the level to grant it at.`
          : "Pick a role, then a level to grant it at."),
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`lv:rw:role:${o}`)
        .setPlaceholder("Reward role…")
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`lv:rw:level:${o}`)
        .setPlaceholder("Grant at level…")
        .setDisabled(!pending)
        .addOptions(REWARD_LEVELS.map((n) => ({ label: `Level ${n}`, value: String(n) }))),
    ),
  ];

  if (state.rewards.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`lv:rw:remove:${o}`)
          .setPlaceholder("Remove a reward…")
          .addOptions(
            state.rewards.slice(0, 25).map((r) => ({ label: `Level ${r.level}`, value: String(r.level) })),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`lv:back:${o}`).setLabel("◀ Back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`lv:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
    ),
  );

  return { embeds: [embed], components: rows };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/panelRender.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leveling/panel/render.js test/modules/leveling/panelRender.test.js
git commit -m "feat(leveling): add /levels panel render views"
```

---

### Task 9: `/levels` panel — handlers, index, command

**Files:**
- Create: `src/modules/leveling/panel/handlers.js`
- Create: `src/modules/leveling/panel/index.js`
- Create: `src/modules/leveling/commands/levels.js`
- Test: `test/modules/leveling/panelHandlers.test.js`

**Interfaces:**
- Consumes: `ConfigService.updateLeveling`; `LevelingService.addReward`/`removeReward`/`getRewards`; `runPanel`; render views from Task 8.
- Produces: `handleLevelingComponent(i, state, ctx, render) -> "update"|"handled"|"close"`; `runLevelingPanel(interaction, ctx) -> Promise<void>`.

- [ ] **Step 1: Write the failing handlers test**

Create `test/modules/leveling/panelHandlers.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { handleLevelingComponent } from "../../../src/modules/leveling/panel/handlers.js";

const ctx = () => ({
  config: { updateLeveling: vi.fn(async () => ({})) },
  leveling: {
    addReward: vi.fn(async () => {}),
    removeReward: vi.fn(async () => {}),
    getRewards: vi.fn(async () => [{ level: 5, roleId: "r5" }]),
  },
});

const baseState = () => ({
  guildId: "g1",
  ownerId: "o1",
  view: "main",
  leveling: { enabled: false, announce: true, xpMin: 15, xpMax: 25, cooldownSec: 60, ignoredChannels: [], ignoredRoles: [] },
  rewards: [],
  pendingRoleId: null,
});
const render = () => ({ embeds: [], components: [] });

describe("handleLevelingComponent", () => {
  it("toggles enabled and persists", async () => {
    const c = ctx();
    const s = baseState();
    const dir = await handleLevelingComponent({ customId: "lv:tog:enabled:o1", user: { id: "o1" } }, s, c, render);
    expect(dir).toBe("update");
    expect(c.config.updateLeveling).toHaveBeenCalledWith("g1", { enabled: true });
    expect(s.leveling.enabled).toBe(true);
  });

  it("navigates to the rewards sub-view and back", async () => {
    const s = baseState();
    await handleLevelingComponent({ customId: "lv:rewards:o1", user: { id: "o1" } }, s, ctx(), render);
    expect(s.view).toBe("rewards");
    await handleLevelingComponent({ customId: "lv:back:o1", user: { id: "o1" } }, s, ctx(), render);
    expect(s.view).toBe("main");
  });

  it("persists ignored channels from the channel select", async () => {
    const c = ctx();
    const s = baseState();
    await handleLevelingComponent({ customId: "lv:ign:channels:o1", values: ["c1", "c2"], user: { id: "o1" } }, s, c, render);
    expect(c.config.updateLeveling).toHaveBeenCalledWith("g1", { ignoredChannels: ["c1", "c2"] });
    expect(s.leveling.ignoredChannels).toEqual(["c1", "c2"]);
  });

  it("stores a pending reward role, then adds the reward when a level is picked", async () => {
    const c = ctx();
    const s = { ...baseState(), view: "rewards" };
    await handleLevelingComponent({ customId: "lv:rw:role:o1", values: ["r10"], user: { id: "o1" } }, s, c, render);
    expect(s.pendingRoleId).toBe("r10");
    await handleLevelingComponent({ customId: "lv:rw:level:o1", values: ["10"], user: { id: "o1" } }, s, c, render);
    expect(c.leveling.addReward).toHaveBeenCalledWith("g1", 10, "r10");
    expect(c.leveling.getRewards).toHaveBeenCalledWith("g1");
    expect(s.pendingRoleId).toBeNull();
    expect(s.rewards).toEqual([{ level: 5, roleId: "r5" }]); // refreshed from service
  });

  it("removes a reward from the remove select", async () => {
    const c = ctx();
    const s = { ...baseState(), view: "rewards", rewards: [{ level: 5, roleId: "r5" }] };
    await handleLevelingComponent({ customId: "lv:rw:remove:o1", values: ["5"], user: { id: "o1" } }, s, c, render);
    expect(c.leveling.removeReward).toHaveBeenCalledWith("g1", 5);
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleLevelingComponent({ customId: "lv:close:o1", user: { id: "o1" } }, baseState(), ctx(), render);
    expect(dir).toBe("close");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/leveling/panelHandlers.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `panel/handlers.js`**

Create `src/modules/leveling/panel/handlers.js`:
```js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";

async function openXpModal(i, state, ctx, render) {
  const a = state.leveling;
  const modalId = `lv:xpmodal:${i.user.id}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("XP settings");
  const field = (id, label, value) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setValue(String(value)).setRequired(true),
    );
  modal.addComponents(
    field("xpMin", "Min XP per message", a.xpMin ?? 15),
    field("xpMax", "Max XP per message", a.xpMax ?? 25),
    field("cooldownSec", "Cooldown seconds", a.cooldownSec ?? 60),
  );
  await i.showModal(modal);

  let sub;
  try {
    sub = await i.awaitModalSubmit({ time: 120000, filter: (m) => m.customId === modalId && m.user.id === i.user.id });
  } catch {
    return "handled";
  }

  const xpMin = Number(sub.fields.getTextInputValue("xpMin"));
  const xpMax = Number(sub.fields.getTextInputValue("xpMax"));
  const cooldownSec = Number(sub.fields.getTextInputValue("cooldownSec"));
  if (![xpMin, xpMax, cooldownSec].every((n) => Number.isInteger(n) && n >= 0) || xpMin > xpMax) {
    await sub.reply({ embeds: [errorEmbed("Min/Max/Cooldown must be whole numbers and Min ≤ Max.")], ephemeral: true });
    return "handled";
  }

  await ctx.config.updateLeveling(state.guildId, { xpMin, xpMax, cooldownSec });
  Object.assign(state.leveling, { xpMin, xpMax, cooldownSec });
  await sub.update(render());
  return "handled";
}

export async function handleLevelingComponent(i, state, ctx, render) {
  const parts = i.customId.split(":"); // lv:<kind>:<arg?>:<owner>
  const kind = parts[1];

  if (kind === "close") return "close";
  if (kind === "rewards") { state.view = "rewards"; return "update"; }
  if (kind === "back") { state.view = "main"; state.pendingRoleId = null; return "update"; }
  if (kind === "xp") return openXpModal(i, state, ctx, render);

  if (kind === "tog") {
    const field = parts[2];
    const next = !state.leveling[field];
    await ctx.config.updateLeveling(state.guildId, { [field]: next });
    state.leveling[field] = next;
    return "update";
  }

  if (kind === "ign") {
    const which = parts[2]; // channels | roles
    const field = which === "channels" ? "ignoredChannels" : "ignoredRoles";
    const values = i.values ?? [];
    await ctx.config.updateLeveling(state.guildId, { [field]: values });
    state.leveling[field] = values;
    return "update";
  }

  if (kind === "rw") {
    const arg = parts[2]; // role | level | remove
    if (arg === "role") {
      state.pendingRoleId = i.values[0];
      return "update";
    }
    if (arg === "level") {
      if (!state.pendingRoleId) return "update";
      const level = Number(i.values[0]);
      await ctx.leveling.addReward(state.guildId, level, state.pendingRoleId);
      state.pendingRoleId = null;
      state.rewards = await ctx.leveling.getRewards(state.guildId);
      return "update";
    }
    if (arg === "remove") {
      const level = Number(i.values[0]);
      await ctx.leveling.removeReward(state.guildId, level);
      state.rewards = await ctx.leveling.getRewards(state.guildId);
      return "update";
    }
  }

  return "update";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/leveling/panelHandlers.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `panel/index.js`**

Create `src/modules/leveling/panel/index.js`:
```js
import { runPanel } from "../../../lib/panel.js";
import { buildMainView, buildRewardsView } from "./render.js";
import { handleLevelingComponent } from "./handlers.js";

const VIEWS = { main: buildMainView, rewards: buildRewardsView };

export async function runLevelingPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const rewards = await ctx.leveling.getRewards(guildId);
  const defaults = { enabled: false, announce: true, xpMin: 15, xpMax: 25, cooldownSec: 60, ignoredChannels: [], ignoredRoles: [] };
  const state = {
    guildId,
    ownerId: interaction.user.id,
    view: "main",
    leveling: { ...defaults, ...(gc.leveling ?? {}) },
    rewards,
    pendingRoleId: null,
  };
  const render = () => (VIEWS[state.view] ?? buildMainView)(state);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleLevelingComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
```

- [ ] **Step 6: Implement `commands/levels.js`**

Create `src/modules/leveling/commands/levels.js`:
```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runLevelingPanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("levels")
    .setDescription("Open the leveling control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runLevelingPanel(interaction, ctx),
};
```

- [ ] **Step 7: Verify command JSON is valid**

Run:
```bash
node --input-type=module -e "import c from './src/modules/leveling/commands/levels.js'; console.log(JSON.stringify(c.data.toJSON()).slice(0,90));"
```
Expected: prints a JSON payload containing `"name":"levels"`.

- [ ] **Step 8: Commit**

```bash
git add src/modules/leveling/panel/handlers.js src/modules/leveling/panel/index.js src/modules/leveling/commands/levels.js test/modules/leveling/panelHandlers.test.js
git commit -m "feat(leveling): add /levels panel handlers, runner, and command"
```

---

### Task 10: Tutorial page + README + full-suite gate

**Files:**
- Modify: `src/modules/util/tutorial.js` (add a Leveling page)
- Modify: `README.md` (add a Leveling section)
- Test: `test/modules/util/tutorial.test.js` (extend existing assertions if it counts pages)

**Interfaces:**
- Consumes: nothing new; documentation + final verification.

- [ ] **Step 1: Check whether the tutorial test pins the page count**

Run: `grep -n "toHaveLength\|length\|pages" test/modules/util/tutorial.test.js`
Expected: note whether a hard page count is asserted. If it is, you will update that number in Step 4.

- [ ] **Step 2: Add a Leveling tutorial page**

In `src/modules/util/tutorial.js`, add a new page object to the pages array (place it after the automod/welcome pages, matching the existing object shape — reuse `EMOJIS.star`):
```js
  {
    title: `${EMOJIS.star} Leveling`,
    body:
      "Reward activity with XP and levels.\n\n" +
      "• `/levels` opens a **control panel** — enable leveling, toggle level-up announcements, set XP rate/cooldown, choose ignored channels/roles, and configure **role rewards**.\n" +
      "• Members earn XP by chatting (rate-limited); level-ups announce in the current channel.\n" +
      "• **Role rewards** are **highest-only** — a member wears just their current tier.\n" +
      "• `/rank` shows a member's level card; `/leaderboard` ranks the server by XP.",
  },
```

- [ ] **Step 3: Add a README section**

In `README.md`, add after an existing feature section:
```markdown
## Leveling

Message-based XP and levels. `/levels` (Administrator) opens a control panel to enable leveling,
toggle level-up announcements, set the XP range and per-user cooldown, pick ignored channels/roles,
and configure **role rewards** (highest-only — a member keeps only their current tier). Members earn
a random amount of XP per message (rate-limited); level-ups are announced in the channel where they
happen. `/rank [user]` renders an image rank card; `/leaderboard` shows the server's top members by
XP. Counting uses message events only — no Message Content intent required.
```

- [ ] **Step 4: Update the tutorial test if it pins a count**

If Step 1 showed a hard page count (e.g. `expect(pages).toHaveLength(N)`), increment it by 1. Otherwise add/keep an assertion that a Leveling page exists:
```js
  it("includes a Leveling page", () => {
    expect(JSON.stringify(pages)).toContain("Leveling");
  });
```
(Adapt the import/variable name to the existing test file.)

- [ ] **Step 5: Run tutorial tests**

Run: `npx vitest run test/modules/util/tutorial.test.js`
Expected: PASS.

- [ ] **Step 6: Run the FULL suite and lint**

Run:
```bash
npx vitest run
npx eslint src/modules/leveling src/bot.js src/core/ConfigService.js
```
Expected: all tests PASS; ESLint clean.

- [ ] **Step 7: Commit**

```bash
git add src/modules/util/tutorial.js README.md test/modules/util/tutorial.test.js
git commit -m "docs(leveling): tutorial page + README section for leveling"
```

---

## Post-plan: register commands

After the plan is complete and merged, propagate the three new commands (`/rank`, `/leaderboard`, `/levels`) with `npm run register` (global, per the current `.env` with `DEV_GUILD_ID` empty). Restart the bot so the new `messageCreate` listener and `ctx.leveling` service are live.
```
