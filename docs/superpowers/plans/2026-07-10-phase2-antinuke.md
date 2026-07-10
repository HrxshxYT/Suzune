# Phase 2 Anti-Nuke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the anti-nuke subsystem — audit-log-driven detection of destructive actions per executor in sliding windows, with configurable punishment, optional auto-revert, staff alerts, whitelist/owner/self exemptions, anti-raid join-spike detection, panic mode, and a `/antinuke` config command.

**Architecture:** A pure, dependency-injected decision path plugged into the `GuildAuditLogEntryCreate` gateway event. `mapAuditLogEntry` classifies an entry into an action key; `getThreshold` resolves the per-guild limit/window; an in-memory `WindowTracker` (held per shard in `AntinukeState`) counts events; `evaluate` decides whether to trigger; and injected `applyPunishment` / `revertAction` / `sendAlert` carry out side effects. Everything except the thin listener + Discord API wrappers is a pure function tested with mocks.

**Tech Stack:** Node.js 25 (ESM), discord.js v14 (`AuditLogEvent`, `PermissionFlagsBits`, `Events`, `EmbedBuilder`, `SlashCommandBuilder`), Prisma (`AntinukeConfig`, `Whitelist`), Vitest.

## Global Constraints

- **Node.js 25**, ES modules only; discord.js v14 API surface only.
- **A guild lives on exactly one shard** — `AntinukeState` counters are in-process per shard; do NOT add cross-shard state.
- **Self-protection invariants (non-negotiable):** never punish the guild owner (`guild.ownerId`) or the bot itself (`guild.members.me.id`); acts only within role hierarchy/permissions; on any missing permission, degrade to alert-only and never throw out of the listener.
- **Dependency injection** — the orchestrator's side effects (`applyPunishment`, `revertAction`, `sendAlert`, `fetchMember`) are passed in so the decision path is unit-testable.
- **All new module code lives under `src/modules/antinuke/`**; the event loader auto-discovers `events/*.js` and `commands/*.js` there. No changes to core loaders needed.
- **Tests:** Vitest, `*.test.js` under `test/` mirroring `src/`. Run one file with `npx vitest run <path>`.
- **Commit** after each task's tests pass (Conventional Commits).
- **Reuse foundation modules:** `COLORS` (`src/lib/constants.js`), `successEmbed`/`errorEmbed`/`infoEmbed` (`src/lib/embeds.js`), `ConfigService` (`src/core/ConfigService.js`), `canActOn` (`src/lib/hierarchy.js`). Do not re-implement them.

---

### Task 1: Sliding-window tracker (`src/modules/antinuke/WindowTracker.js`)

**Files:**
- Create: `src/modules/antinuke/WindowTracker.js`
- Test: `test/modules/antinuke/WindowTracker.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: class `WindowTracker` — `constructor(now = () => Date.now())`; `record(key, windowMs): number` (appends now, prunes entries older than `windowMs`, returns current count in window); `reset(key): void`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { WindowTracker } from "../../../src/modules/antinuke/WindowTracker.js";

describe("WindowTracker", () => {
  it("counts events within the window", () => {
    let t = 1000;
    const wt = new WindowTracker(() => t);
    expect(wt.record("k", 10_000)).toBe(1);
    t = 3000;
    expect(wt.record("k", 10_000)).toBe(2);
    t = 6000;
    expect(wt.record("k", 10_000)).toBe(3);
  });

  it("drops events older than the window", () => {
    let t = 1000;
    const wt = new WindowTracker(() => t);
    wt.record("k", 5_000); // at 1000
    t = 7000; // 6s later, first event (1000) is now outside a 5s window
    expect(wt.record("k", 5_000)).toBe(1);
  });

  it("keeps separate counts per key and supports reset", () => {
    const wt = new WindowTracker(() => 1000);
    wt.record("a", 10_000);
    expect(wt.record("b", 10_000)).toBe(1);
    wt.reset("a");
    expect(wt.record("a", 10_000)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/WindowTracker.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
export class WindowTracker {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.events = new Map(); // key -> number[] (timestamps)
  }

  record(key, windowMs) {
    const nowMs = this.now();
    const cutoff = nowMs - windowMs;
    const kept = (this.events.get(key) ?? []).filter((t) => t > cutoff);
    kept.push(nowMs);
    this.events.set(key, kept);
    return kept.length;
  }

  reset(key) {
    this.events.delete(key);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/WindowTracker.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/WindowTracker.js test/modules/antinuke/WindowTracker.test.js
git commit -m "feat(antinuke): add sliding-window event tracker"
```

---

### Task 2: Per-guild state holder (`src/modules/antinuke/AntinukeState.js`)

**Files:**
- Create: `src/modules/antinuke/AntinukeState.js`
- Test: `test/modules/antinuke/AntinukeState.test.js`

**Interfaces:**
- Consumes: `WindowTracker` (Task 1).
- Produces: class `AntinukeState` — `constructor(now = () => Date.now())`; `recordAction(guildId, actionKey, executorId, windowMs): number`; `recordJoin(guildId, windowMs): number`. Actions and joins use independent trackers.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { AntinukeState } from "../../../src/modules/antinuke/AntinukeState.js";

describe("AntinukeState", () => {
  it("counts actions per guild/action/executor", () => {
    const s = new AntinukeState(() => 1000);
    expect(s.recordAction("g1", "channelDelete", "u1", 10_000)).toBe(1);
    expect(s.recordAction("g1", "channelDelete", "u1", 10_000)).toBe(2);
    expect(s.recordAction("g1", "channelDelete", "u2", 10_000)).toBe(1); // different executor
  });

  it("counts joins per guild independently of actions", () => {
    const s = new AntinukeState(() => 1000);
    s.recordAction("g1", "ban", "u1", 10_000);
    expect(s.recordJoin("g1", 10_000)).toBe(1);
    expect(s.recordJoin("g1", 10_000)).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/AntinukeState.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
import { WindowTracker } from "./WindowTracker.js";

export class AntinukeState {
  constructor(now = () => Date.now()) {
    this.actions = new WindowTracker(now);
    this.joins = new WindowTracker(now);
  }

  recordAction(guildId, actionKey, executorId, windowMs) {
    return this.actions.record(`${guildId}:${actionKey}:${executorId}`, windowMs);
  }

  recordJoin(guildId, windowMs) {
    return this.joins.record(guildId, windowMs);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/AntinukeState.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/AntinukeState.js test/modules/antinuke/AntinukeState.test.js
git commit -m "feat(antinuke): add per-guild in-memory state holder"
```

---

### Task 3: Action taxonomy (`src/modules/antinuke/actions.js`)

**Files:**
- Create: `src/modules/antinuke/actions.js`
- Test: `test/modules/antinuke/actions.test.js`

**Interfaces:**
- Consumes: `AuditLogEvent`, `PermissionFlagsBits` from discord.js.
- Produces:
  - `DEFAULT_THRESHOLDS`: `Record<actionKey, { limit: number, windowSec: number, enabled: boolean }>`.
  - `mapAuditLogEntry(entry): { actionKey: string } | null` — classifies an audit log entry (`entry.action` is an `AuditLogEvent`; `entry.changes` an array of `{ key, old, new }`). Benign role updates return `null`; a role update granting `Administrator` returns `{ actionKey: "roleUpdateDangerous" }`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { AuditLogEvent, PermissionFlagsBits } from "discord.js";
import { mapAuditLogEntry, DEFAULT_THRESHOLDS } from "../../../src/modules/antinuke/actions.js";

describe("mapAuditLogEntry", () => {
  it("maps direct destructive actions to keys", () => {
    expect(mapAuditLogEntry({ action: AuditLogEvent.ChannelDelete })).toEqual({
      actionKey: "channelDelete",
    });
    expect(mapAuditLogEntry({ action: AuditLogEvent.MemberBanAdd })).toEqual({ actionKey: "ban" });
    expect(mapAuditLogEntry({ action: AuditLogEvent.WebhookCreate })).toEqual({
      actionKey: "webhookCreate",
    });
    expect(mapAuditLogEntry({ action: AuditLogEvent.BotAdd })).toEqual({ actionKey: "botAdd" });
  });

  it("returns null for unwatched actions", () => {
    expect(mapAuditLogEntry({ action: AuditLogEvent.MessagePin })).toBeNull();
  });

  it("flags a role update that grants Administrator as dangerous", () => {
    const admin = PermissionFlagsBits.Administrator.toString();
    const entry = {
      action: AuditLogEvent.RoleUpdate,
      changes: [{ key: "permissions", old: "0", new: admin }],
    };
    expect(mapAuditLogEntry(entry)).toEqual({ actionKey: "roleUpdateDangerous" });
  });

  it("ignores a benign role update", () => {
    const entry = {
      action: AuditLogEvent.RoleUpdate,
      changes: [{ key: "name", old: "a", new: "b" }],
    };
    expect(mapAuditLogEntry(entry)).toBeNull();
  });

  it("provides sane default thresholds for every mapped key", () => {
    expect(DEFAULT_THRESHOLDS.channelDelete.limit).toBeGreaterThan(0);
    expect(DEFAULT_THRESHOLDS.roleUpdateDangerous.limit).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/actions.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
import { AuditLogEvent, PermissionFlagsBits } from "discord.js";

export const DEFAULT_THRESHOLDS = {
  channelCreate: { limit: 5, windowSec: 10, enabled: true },
  channelDelete: { limit: 3, windowSec: 10, enabled: true },
  channelUpdate: { limit: 6, windowSec: 15, enabled: true },
  roleCreate: { limit: 5, windowSec: 10, enabled: true },
  roleDelete: { limit: 3, windowSec: 10, enabled: true },
  roleUpdateDangerous: { limit: 1, windowSec: 30, enabled: true },
  ban: { limit: 5, windowSec: 15, enabled: true },
  kick: { limit: 5, windowSec: 15, enabled: true },
  prune: { limit: 1, windowSec: 60, enabled: true },
  webhookCreate: { limit: 5, windowSec: 10, enabled: true },
  webhookDelete: { limit: 5, windowSec: 10, enabled: true },
  botAdd: { limit: 1, windowSec: 60, enabled: true },
  guildUpdate: { limit: 2, windowSec: 30, enabled: true },
  emojiDelete: { limit: 5, windowSec: 15, enabled: true },
  stickerDelete: { limit: 5, windowSec: 15, enabled: true },
};

const DIRECT = {
  [AuditLogEvent.ChannelCreate]: "channelCreate",
  [AuditLogEvent.ChannelDelete]: "channelDelete",
  [AuditLogEvent.ChannelUpdate]: "channelUpdate",
  [AuditLogEvent.RoleCreate]: "roleCreate",
  [AuditLogEvent.RoleDelete]: "roleDelete",
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
  [AuditLogEvent.MemberPrune]: "prune",
  [AuditLogEvent.WebhookCreate]: "webhookCreate",
  [AuditLogEvent.WebhookDelete]: "webhookDelete",
  [AuditLogEvent.BotAdd]: "botAdd",
  [AuditLogEvent.GuildUpdate]: "guildUpdate",
  [AuditLogEvent.EmojiDelete]: "emojiDelete",
  [AuditLogEvent.StickerDelete]: "stickerDelete",
};

function grantsAdmin(changes = []) {
  const perm = changes.find((c) => c.key === "permissions");
  if (!perm) return false;
  const admin = PermissionFlagsBits.Administrator;
  const newBits = BigInt(perm.new ?? 0);
  const oldBits = BigInt(perm.old ?? 0);
  return (newBits & admin) === admin && (oldBits & admin) !== admin;
}

export function mapAuditLogEntry(entry) {
  if (entry.action === AuditLogEvent.RoleUpdate) {
    return grantsAdmin(entry.changes) ? { actionKey: "roleUpdateDangerous" } : null;
  }
  const actionKey = DIRECT[entry.action];
  return actionKey ? { actionKey } : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/actions.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/actions.js test/modules/antinuke/actions.test.js
git commit -m "feat(antinuke): add audit-log action taxonomy and default thresholds"
```

---

### Task 4: Config helpers (`src/modules/antinuke/config.js`)

**Files:**
- Create: `src/modules/antinuke/config.js`
- Test: `test/modules/antinuke/config.test.js`

**Interfaces:**
- Consumes: `DEFAULT_THRESHOLDS` (Task 3).
- Produces:
  - `isWhitelisted(member, whitelist): boolean` — `whitelist` is an array of `{ targetId, type: "user"|"role" }`; a `null` member is never whitelisted.
  - `getThreshold(antinukeConfig, actionKey): { limit, windowSec, enabled }` — merges per-guild `antinukeConfig.thresholds[actionKey]` over `DEFAULT_THRESHOLDS[actionKey]`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { isWhitelisted, getThreshold } from "../../../src/modules/antinuke/config.js";

const member = (id, roleIds = []) => ({
  id,
  roles: { cache: new Map(roleIds.map((r) => [r, { id: r }])) },
});

describe("isWhitelisted", () => {
  const wl = [
    { targetId: "u1", type: "user" },
    { targetId: "r1", type: "role" },
  ];
  it("matches a whitelisted user", () => {
    expect(isWhitelisted(member("u1"), wl)).toBe(true);
  });
  it("matches a member holding a whitelisted role", () => {
    expect(isWhitelisted(member("u9", ["r1"]), wl)).toBe(true);
  });
  it("rejects a non-whitelisted member and a null member", () => {
    expect(isWhitelisted(member("u9"), wl)).toBe(false);
    expect(isWhitelisted(null, wl)).toBe(false);
  });
});

describe("getThreshold", () => {
  it("returns defaults when there is no override", () => {
    const t = getThreshold({ thresholds: {} }, "channelDelete");
    expect(t).toEqual({ limit: 3, windowSec: 10, enabled: true });
  });
  it("merges a per-guild override over defaults", () => {
    const t = getThreshold({ thresholds: { channelDelete: { limit: 2 } } }, "channelDelete");
    expect(t).toEqual({ limit: 2, windowSec: 10, enabled: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/config.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
import { DEFAULT_THRESHOLDS } from "./actions.js";

export function isWhitelisted(member, whitelist = []) {
  if (!member) return false;
  for (const entry of whitelist) {
    if (entry.type === "user" && entry.targetId === member.id) return true;
    if (entry.type === "role" && member.roles.cache.has(entry.targetId)) return true;
  }
  return false;
}

export function getThreshold(antinukeConfig, actionKey) {
  const def = DEFAULT_THRESHOLDS[actionKey] ?? { limit: 3, windowSec: 10, enabled: true };
  const override = antinukeConfig?.thresholds?.[actionKey] ?? {};
  return {
    limit: override.limit ?? def.limit,
    windowSec: override.windowSec ?? def.windowSec,
    enabled: override.enabled ?? def.enabled,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/config.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/config.js test/modules/antinuke/config.test.js
git commit -m "feat(antinuke): add whitelist and threshold resolution helpers"
```

---

### Task 5: Decision engine (`src/modules/antinuke/engine.js`)

**Files:**
- Create: `src/modules/antinuke/engine.js`
- Test: `test/modules/antinuke/engine.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `evaluate({ count, limit, panic = false }): { triggered: boolean }` — triggers when `count >= limit`; in panic mode the effective limit is `1` (any single destructive action triggers).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { evaluate } from "../../../src/modules/antinuke/engine.js";

describe("evaluate", () => {
  it("does not trigger below the limit", () => {
    expect(evaluate({ count: 2, limit: 3 }).triggered).toBe(false);
  });
  it("triggers at or above the limit", () => {
    expect(evaluate({ count: 3, limit: 3 }).triggered).toBe(true);
    expect(evaluate({ count: 4, limit: 3 }).triggered).toBe(true);
  });
  it("triggers on the first event in panic mode", () => {
    expect(evaluate({ count: 1, limit: 99, panic: true }).triggered).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/engine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
export function evaluate({ count, limit, panic = false }) {
  const effectiveLimit = panic ? 1 : limit;
  return { triggered: count >= effectiveLimit };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/engine.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/engine.js test/modules/antinuke/engine.test.js
git commit -m "feat(antinuke): add threshold decision engine"
```

---

### Task 6: ConfigService anti-nuke methods (`src/core/ConfigService.js`)

**Files:**
- Modify: `src/core/ConfigService.js`
- Test: `test/core/ConfigService.antinuke.test.js`

**Interfaces:**
- Consumes: injected Prisma-like client with `antinukeConfig.upsert`, `whitelist.upsert`, `whitelist.deleteMany`, plus existing `guild.*`.
- Produces (added to class `ConfigService`):
  - `async updateAntinuke(guildId, data): row` — ensures the guild row exists, upserts `AntinukeConfig`, invalidates the guild cache.
  - `async addWhitelist(guildId, targetId, type, addedById): row` — ensures guild exists, upserts a `Whitelist` row, invalidates cache.
  - `async removeWhitelist(guildId, targetId): void` — deletes matching whitelist rows, invalidates cache.
- Also: extend the private `INCLUDE` so `getGuild` returns `whitelist`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", antinuke: null, logging: null, modRoles: [], whitelist: [] })),
      create: vi.fn(async ({ data }) => ({ ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    antinukeConfig: {
      upsert: vi.fn(async ({ where, create, update }) => ({ guildId: where.guildId, ...create, ...update })),
    },
    whitelist: {
      upsert: vi.fn(async ({ create }) => ({ ...create })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("ConfigService anti-nuke methods", () => {
  it("upserts anti-nuke config and invalidates cache", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1"); // populate cache
    const row = await svc.updateAntinuke("g1", { enabled: true, punishment: "ban" });
    expect(row.enabled).toBe(true);
    expect(prisma.antinukeConfig.upsert).toHaveBeenCalled();
    // cache was invalidated -> next getGuild hits the DB again
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(2);
  });

  it("adds and removes whitelist entries", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    const wl = await svc.addWhitelist("g1", "u1", "user", "admin1");
    expect(wl).toMatchObject({ guildId: "g1", targetId: "u1", type: "user", addedById: "admin1" });
    await svc.removeWhitelist("g1", "u1");
    expect(prisma.whitelist.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g1", targetId: "u1" },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/core/ConfigService.antinuke.test.js`
Expected: FAIL — `updateAntinuke is not a function`.

- [ ] **Step 3: Modify `src/core/ConfigService.js`**

Change the `INCLUDE` constant at the top of the file from:

```js
const INCLUDE = { antinuke: true, logging: true, modRoles: true };
```

to:

```js
const INCLUDE = { antinuke: true, logging: true, modRoles: true, whitelist: true };
```

Then add these three methods to the `ConfigService` class (after `updateGuild`):

```js
  async updateAntinuke(guildId, data) {
    await this.getGuild(guildId); // ensure the parent guild row exists
    const row = await this.prisma.antinukeConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async addWhitelist(guildId, targetId, type, addedById) {
    await this.getGuild(guildId);
    const row = await this.prisma.whitelist.upsert({
      where: { guildId_targetId: { guildId, targetId } },
      create: { guildId, targetId, type, addedById },
      update: { type },
    });
    this.invalidate(guildId);
    return row;
  }

  async removeWhitelist(guildId, targetId) {
    await this.prisma.whitelist.deleteMany({ where: { guildId, targetId } });
    this.invalidate(guildId);
  }
```

- [ ] **Step 4: Run to verify it passes (and the existing ConfigService test still passes)**

Run: `npx vitest run test/core/ConfigService.antinuke.test.js test/core/ConfigService.test.js`
Expected: PASS — both files green.

- [ ] **Step 5: Commit**

```bash
git add src/core/ConfigService.js test/core/ConfigService.antinuke.test.js
git commit -m "feat(antinuke): add anti-nuke config and whitelist persistence"
```

---

### Task 7: Punishment executor (`src/modules/antinuke/punish.js`)

**Files:**
- Create: `src/modules/antinuke/punish.js`
- Test: `test/modules/antinuke/punish.test.js`

**Interfaces:**
- Consumes: a `guild` (with `bans.create`), a `member` (with `kick`, `roles.set`), and a `logger`.
- Produces: `async applyPunishment({ type, guild, executorId, member, reason, quarantineRoleId, logger }): string` — dispatches by `type` (`ban|kick|strip|quarantine|removeperms`), returns the outcome string (`"ban"|"kick"|"strip"|"quarantine"|"removeperms"|"none"|"failed"`). Any thrown Discord error is caught, logged, and returned as `"failed"` (never rethrown).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { applyPunishment } from "../../../src/modules/antinuke/punish.js";

const logger = { error: vi.fn() };
const makeGuild = () => ({ bans: { create: vi.fn(async () => {}) } });
const makeMember = () => ({ kick: vi.fn(async () => {}), roles: { set: vi.fn(async () => {}) } });

describe("applyPunishment", () => {
  it("bans via guild.bans.create", async () => {
    const guild = makeGuild();
    const out = await applyPunishment({ type: "ban", guild, executorId: "u1", reason: "nuke", logger });
    expect(out).toBe("ban");
    expect(guild.bans.create).toHaveBeenCalledWith("u1", { reason: "nuke" });
  });

  it("kicks via member.kick", async () => {
    const member = makeMember();
    const out = await applyPunishment({ type: "kick", guild: makeGuild(), member, reason: "nuke", logger });
    expect(out).toBe("kick");
    expect(member.kick).toHaveBeenCalledWith("nuke");
  });

  it("strips roles via member.roles.set([])", async () => {
    const member = makeMember();
    const out = await applyPunishment({ type: "strip", guild: makeGuild(), member, reason: "nuke", logger });
    expect(out).toBe("strip");
    expect(member.roles.set).toHaveBeenCalledWith([], "nuke");
  });

  it("quarantines by setting only the quarantine role", async () => {
    const member = makeMember();
    const out = await applyPunishment({
      type: "quarantine",
      guild: makeGuild(),
      member,
      quarantineRoleId: "q1",
      reason: "nuke",
      logger,
    });
    expect(out).toBe("quarantine");
    expect(member.roles.set).toHaveBeenCalledWith(["q1"], "nuke");
  });

  it("returns 'failed' and logs when the API throws", async () => {
    const guild = { bans: { create: vi.fn(async () => { throw new Error("no perms"); }) } };
    const out = await applyPunishment({ type: "ban", guild, executorId: "u1", reason: "nuke", logger });
    expect(out).toBe("failed");
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/punish.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
export async function applyPunishment({ type, guild, executorId, member, reason, quarantineRoleId, logger }) {
  try {
    switch (type) {
      case "ban":
        await guild.bans.create(executorId, { reason });
        return "ban";
      case "kick":
        if (member) await member.kick(reason);
        return "kick";
      case "strip":
        if (member) await member.roles.set([], reason);
        return "strip";
      case "quarantine":
        if (member && quarantineRoleId) await member.roles.set([quarantineRoleId], reason);
        return "quarantine";
      case "removeperms":
        // Removing all roles is the safe proxy for stripping dangerous permissions.
        if (member) await member.roles.set([], reason);
        return "removeperms";
      default:
        return "none";
    }
  } catch (err) {
    logger.error({ err, type, executorId }, "anti-nuke punishment failed");
    return "failed";
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/punish.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/punish.js test/modules/antinuke/punish.test.js
git commit -m "feat(antinuke): add punishment executor"
```

---

### Task 8: Auto-revert (`src/modules/antinuke/revert.js`)

**Files:**
- Create: `src/modules/antinuke/revert.js`
- Test: `test/modules/antinuke/revert.test.js`

**Interfaces:**
- Consumes: a `guild` (with `channels.create`, `roles.create`, `bans.remove`), the audit-log `entry` (`{ target, targetId }`), a `logger`.
- Produces: `async revertAction({ actionKey, entry, guild, logger }): string` — recreates a deleted channel (`"channel_recreated"`), recreates a deleted role (`"role_recreated"`), or lifts a ban (`"unbanned"`); unsupported keys return `"no_revert"`; caught errors return `"failed"`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { revertAction } from "../../../src/modules/antinuke/revert.js";

const logger = { error: vi.fn() };
const makeGuild = () => ({
  channels: { create: vi.fn(async () => {}) },
  roles: { create: vi.fn(async () => {}) },
  bans: { remove: vi.fn(async () => {}) },
});

describe("revertAction", () => {
  it("recreates a deleted channel", async () => {
    const guild = makeGuild();
    const out = await revertAction({
      actionKey: "channelDelete",
      entry: { target: { name: "general", type: 0 } },
      guild,
      logger,
    });
    expect(out).toBe("channel_recreated");
    expect(guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "general" }),
    );
  });

  it("recreates a deleted role", async () => {
    const guild = makeGuild();
    const out = await revertAction({
      actionKey: "roleDelete",
      entry: { target: { name: "Members" } },
      guild,
      logger,
    });
    expect(out).toBe("role_recreated");
    expect(guild.roles.create).toHaveBeenCalled();
  });

  it("lifts a ban", async () => {
    const guild = makeGuild();
    const out = await revertAction({ actionKey: "ban", entry: { targetId: "victim1" }, guild, logger });
    expect(out).toBe("unbanned");
    expect(guild.bans.remove).toHaveBeenCalledWith("victim1", expect.any(String));
  });

  it("returns no_revert for unsupported actions", async () => {
    const out = await revertAction({ actionKey: "channelUpdate", entry: {}, guild: makeGuild(), logger });
    expect(out).toBe("no_revert");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/revert.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
export async function revertAction({ actionKey, entry, guild, logger }) {
  try {
    switch (actionKey) {
      case "channelDelete": {
        const t = entry.target ?? {};
        await guild.channels.create({ name: t.name ?? "restored-channel", type: t.type });
        return "channel_recreated";
      }
      case "roleDelete": {
        const t = entry.target ?? {};
        await guild.roles.create({ name: t.name ?? "restored-role" });
        return "role_recreated";
      }
      case "ban": {
        if (entry.targetId) await guild.bans.remove(entry.targetId, "anti-nuke auto-revert");
        return "unbanned";
      }
      default:
        return "no_revert";
    }
  } catch (err) {
    logger.error({ err, actionKey }, "anti-nuke auto-revert failed");
    return "failed";
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/revert.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/revert.js test/modules/antinuke/revert.test.js
git commit -m "feat(antinuke): add auto-revert for deleted channels/roles and bans"
```

---

### Task 9: Incident alert (`src/modules/antinuke/alert.js`)

**Files:**
- Create: `src/modules/antinuke/alert.js`
- Test: `test/modules/antinuke/alert.test.js`

**Interfaces:**
- Consumes: `EmbedBuilder` (discord.js), `COLORS` (`src/lib/constants.js`).
- Produces:
  - `buildIncidentEmbed({ actionKey, executorId, count, punishment }): EmbedBuilder` — an error-colored incident embed.
  - `async sendAlert({ guild, channelId, actionKey, executorId, count, punishment }, logger): boolean` — fetches the alert channel and posts the embed; returns `false` (no throw) when `channelId` is missing or the send fails.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { buildIncidentEmbed, sendAlert } from "../../../src/modules/antinuke/alert.js";
import { COLORS } from "../../../src/lib/constants.js";

describe("buildIncidentEmbed", () => {
  it("builds an error-colored incident embed with executor and action", () => {
    const e = buildIncidentEmbed({ actionKey: "channelDelete", executorId: "u1", count: 4, punishment: "ban" });
    expect(e.data.color).toBe(COLORS.error);
    expect(JSON.stringify(e.data)).toContain("channelDelete");
    expect(JSON.stringify(e.data)).toContain("u1");
  });
});

describe("sendAlert", () => {
  it("returns false when no channel is configured", async () => {
    const out = await sendAlert({ guild: {}, channelId: null, actionKey: "ban", executorId: "u1", count: 5, punishment: "ban" }, { error: vi.fn() });
    expect(out).toBe(false);
  });

  it("sends to a text channel and returns true", async () => {
    const send = vi.fn(async () => {});
    const guild = { channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const out = await sendAlert({ guild, channelId: "c1", actionKey: "ban", executorId: "u1", count: 5, punishment: "ban" }, { error: vi.fn() });
    expect(out).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/alert.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

export function buildIncidentEmbed({ actionKey, executorId, count, punishment }) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle("🚨 Anti-Nuke Triggered")
    .setDescription(`Detected excessive **${actionKey}** activity and took protective action.`)
    .addFields(
      { name: "Executor", value: `<@${executorId}> (\`${executorId}\`)`, inline: true },
      { name: "Events", value: String(count), inline: true },
      { name: "Action taken", value: `\`${punishment}\``, inline: true },
    )
    .setTimestamp();
}

export async function sendAlert({ guild, channelId, actionKey, executorId, count, punishment }, logger) {
  if (!channelId) return false;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [buildIncidentEmbed({ actionKey, executorId, count, punishment })] });
      return true;
    }
  } catch (err) {
    logger?.error({ err, channelId }, "anti-nuke alert send failed");
  }
  return false;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/alert.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/alert.js test/modules/antinuke/alert.test.js
git commit -m "feat(antinuke): add incident alert embed and dispatch"
```

---

### Task 10: Orchestrator + audit-log listener (`src/modules/antinuke/orchestrator.js`, `src/modules/antinuke/events/guildAuditLogEntryCreate.js`)

**Files:**
- Create: `src/modules/antinuke/orchestrator.js`
- Create: `src/modules/antinuke/events/guildAuditLogEntryCreate.js`
- Test: `test/modules/antinuke/orchestrator.test.js`

**Interfaces:**
- Consumes: `mapAuditLogEntry` (T3), `getThreshold`/`isWhitelisted` (T4), `evaluate` (T5); injected `deps` = `{ fetchMember, applyPunishment, revertAction, sendAlert }`.
- Produces:
  - `async processAuditEntry({ entry, guild, guildConfig, state, deps, logger }): { action: string, ... }` — the pure orchestration returning a machine-readable result: `"ignored" | "disabled" | "no_executor" | "exempt_owner" | "exempt_self" | "exempt_whitelist" | "action_disabled" | "under_threshold" | "punished"`. On `"punished"` it invokes `deps.applyPunishment`, then `deps.revertAction` (only if `guildConfig.antinuke.autoRevert`), then `deps.sendAlert`.
  - default-export listener `{ name: Events.GuildAuditLogEntryCreate, execute(ctx, entry, guild) }` — thin wrapper that loads config via `ctx.config.getGuild`, builds real `deps` (using `applyPunishment`/`revertAction`/`sendAlert` and a `fetchMember` that calls `guild.members.fetch`), and calls `processAuditEntry`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { AuditLogEvent } from "discord.js";
import { processAuditEntry } from "../../../src/modules/antinuke/orchestrator.js";
import { AntinukeState } from "../../../src/modules/antinuke/AntinukeState.js";

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

function baseGuild() {
  return { id: "g1", ownerId: "owner", members: { me: { id: "bot" } } };
}
function enabledConfig(overrides = {}) {
  return {
    antinuke: {
      enabled: true,
      punishment: "ban",
      autoRevert: false,
      alertChannelId: "c1",
      panicMode: false,
      thresholds: {},
      ...overrides,
    },
    whitelist: [],
  };
}
function deps() {
  return {
    fetchMember: vi.fn(async () => ({ id: "attacker", roles: { cache: new Map() } })),
    applyPunishment: vi.fn(async () => "ban"),
    revertAction: vi.fn(async () => "no_revert"),
    sendAlert: vi.fn(async () => true),
  };
}

const banEntry = (executorId = "attacker") => ({
  action: AuditLogEvent.MemberBanAdd,
  executorId,
  targetId: "victim",
});

describe("processAuditEntry", () => {
  it("ignores unwatched entries", async () => {
    const res = await processAuditEntry({
      entry: { action: AuditLogEvent.MessagePin, executorId: "x" },
      guild: baseGuild(),
      guildConfig: enabledConfig(),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(res.action).toBe("ignored");
  });

  it("does nothing when anti-nuke is disabled", async () => {
    const res = await processAuditEntry({
      entry: banEntry(),
      guild: baseGuild(),
      guildConfig: { antinuke: { enabled: false }, whitelist: [] },
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(res.action).toBe("disabled");
  });

  it("exempts the guild owner and the bot itself", async () => {
    const owner = await processAuditEntry({
      entry: banEntry("owner"),
      guild: baseGuild(),
      guildConfig: enabledConfig(),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(owner.action).toBe("exempt_owner");

    const self = await processAuditEntry({
      entry: banEntry("bot"),
      guild: baseGuild(),
      guildConfig: enabledConfig(),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(self.action).toBe("exempt_self");
  });

  it("exempts a whitelisted executor", async () => {
    const d = deps();
    const res = await processAuditEntry({
      entry: banEntry("attacker"),
      guild: baseGuild(),
      guildConfig: { ...enabledConfig(), whitelist: [{ targetId: "attacker", type: "user" }] },
      state: new AntinukeState(() => 1000),
      deps: d,
      logger,
    });
    expect(res.action).toBe("exempt_whitelist");
    expect(d.applyPunishment).not.toHaveBeenCalled();
  });

  it("stays quiet under the threshold", async () => {
    const state = new AntinukeState(() => 1000);
    const d = deps();
    // ban default limit is 5; a single event stays under
    const res = await processAuditEntry({
      entry: banEntry(),
      guild: baseGuild(),
      guildConfig: enabledConfig(),
      state,
      deps: d,
      logger,
    });
    expect(res.action).toBe("under_threshold");
    expect(d.applyPunishment).not.toHaveBeenCalled();
  });

  it("punishes, reverts (when enabled), and alerts once the threshold is hit", async () => {
    const state = new AntinukeState(() => 1000);
    const d = deps();
    const guildConfig = enabledConfig({ autoRevert: true });
    // channelDelete default limit is 3 -> need 3 events to trigger
    const entry = { action: AuditLogEvent.ChannelDelete, executorId: "attacker", target: { name: "gen", type: 0 } };
    let res;
    for (let i = 0; i < 3; i++) {
      res = await processAuditEntry({ entry, guild: baseGuild(), guildConfig, state, deps: d, logger });
    }
    expect(res.action).toBe("punished");
    expect(d.applyPunishment).toHaveBeenCalledWith(expect.objectContaining({ type: "ban" }));
    expect(d.revertAction).toHaveBeenCalled();
    expect(d.sendAlert).toHaveBeenCalled();
  });

  it("triggers on the first event in panic mode", async () => {
    const d = deps();
    const res = await processAuditEntry({
      entry: banEntry(),
      guild: baseGuild(),
      guildConfig: enabledConfig({ panicMode: true }),
      state: new AntinukeState(() => 1000),
      deps: d,
      logger,
    });
    expect(res.action).toBe("punished");
    expect(d.applyPunishment).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/orchestrator.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/antinuke/orchestrator.js`**

```js
import { Events } from "discord.js";
import { mapAuditLogEntry } from "./actions.js";
import { getThreshold, isWhitelisted } from "./config.js";
import { evaluate } from "./engine.js";
import { applyPunishment } from "./punish.js";
import { revertAction } from "./revert.js";
import { sendAlert } from "./alert.js";

export async function processAuditEntry({ entry, guild, guildConfig, state, deps, logger }) {
  const mapped = mapAuditLogEntry(entry);
  if (!mapped) return { action: "ignored" };

  const antinuke = guildConfig.antinuke;
  if (!antinuke?.enabled) return { action: "disabled" };

  const executorId = entry.executorId;
  if (!executorId) return { action: "no_executor" };
  if (executorId === guild.ownerId) return { action: "exempt_owner" };
  if (executorId === guild.members.me.id) return { action: "exempt_self" };

  const member = await deps.fetchMember(guild, executorId);
  if (isWhitelisted(member, guildConfig.whitelist)) return { action: "exempt_whitelist" };

  const threshold = getThreshold(antinuke, mapped.actionKey);
  if (!threshold.enabled) return { action: "action_disabled" };

  const count = state.recordAction(guild.id, mapped.actionKey, executorId, threshold.windowSec * 1000);
  const { triggered } = evaluate({ count, limit: threshold.limit, panic: antinuke.panicMode });
  if (!triggered) return { action: "under_threshold", count };

  const punishment = await deps.applyPunishment({
    type: antinuke.punishment,
    guild,
    executorId,
    member,
    reason: `Anti-nuke: excessive ${mapped.actionKey}`,
    quarantineRoleId: antinuke.quarantineRoleId,
    logger,
  });

  if (antinuke.autoRevert) {
    await deps.revertAction({ actionKey: mapped.actionKey, entry, guild, logger });
  }

  await deps.sendAlert(
    { guild, channelId: antinuke.alertChannelId, actionKey: mapped.actionKey, executorId, count, punishment },
    logger,
  );

  return { action: "punished", punishment, count };
}

export default {
  name: Events.GuildAuditLogEntryCreate,
  async execute(ctx, entry, guild) {
    try {
      const guildConfig = await ctx.config.getGuild(guild.id);
      const deps = {
        fetchMember: async (g, id) => g.members.fetch(id).catch(() => null),
        applyPunishment,
        revertAction,
        sendAlert,
      };
      await processAuditEntry({ entry, guild, guildConfig, state: ctx.antinuke, deps, logger: ctx.logger });
    } catch (err) {
      ctx.logger.error({ err }, "anti-nuke listener error");
    }
  },
};
```

- [ ] **Step 4: Write the listener file `src/modules/antinuke/events/guildAuditLogEntryCreate.js`**

```js
export { default } from "../orchestrator.js";
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/orchestrator.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/antinuke/orchestrator.js src/modules/antinuke/events/guildAuditLogEntryCreate.js test/modules/antinuke/orchestrator.test.js
git commit -m "feat(antinuke): add detection orchestrator and audit-log listener"
```

---

### Task 11: Anti-raid join-spike detection (`src/modules/antinuke/raid.js`, `src/modules/antinuke/events/guildMemberAdd.js`)

**Files:**
- Create: `src/modules/antinuke/raid.js`
- Create: `src/modules/antinuke/events/guildMemberAdd.js`
- Test: `test/modules/antinuke/raid.test.js`

**Interfaces:**
- Consumes: `AntinukeState.recordJoin` (T2); injected `deps` = `{ kickMember, sendAlert }`.
- Produces:
  - `async processMemberAdd({ member, guildConfig, state, deps, logger }): { action: string }` — returns `"disabled"` when anti-raid off; `"under_threshold"` below the spike limit; `"raid"` when `count >= raidJoinCount` within the window (kicks the joining member via `deps.kickMember` and alerts).
  - default-export listener `{ name: Events.GuildMemberAdd, execute(ctx, member) }`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { processMemberAdd } from "../../../src/modules/antinuke/raid.js";
import { AntinukeState } from "../../../src/modules/antinuke/AntinukeState.js";

const logger = { error: vi.fn(), warn: vi.fn() };
const member = () => ({ id: "j1", guild: { id: "g1" }, kick: vi.fn(async () => {}) });

function cfg(overrides = {}) {
  return { antinuke: { enabled: true, antiRaidEnabled: true, raidJoinCount: 3, raidWindowSec: 10, alertChannelId: "c1", ...overrides } };
}
function deps() {
  return { kickMember: vi.fn(async () => {}), sendAlert: vi.fn(async () => true) };
}

describe("processMemberAdd", () => {
  it("does nothing when anti-raid is disabled", async () => {
    const res = await processMemberAdd({
      member: member(),
      guildConfig: cfg({ antiRaidEnabled: false }),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(res.action).toBe("disabled");
  });

  it("stays quiet below the join spike", async () => {
    const res = await processMemberAdd({
      member: member(),
      guildConfig: cfg(),
      state: new AntinukeState(() => 1000),
      deps: deps(),
      logger,
    });
    expect(res.action).toBe("under_threshold");
  });

  it("flags a raid once the join spike is reached and kicks the joiner", async () => {
    const state = new AntinukeState(() => 1000);
    const d = deps();
    let res;
    for (let i = 0; i < 3; i++) {
      res = await processMemberAdd({ member: member(), guildConfig: cfg(), state, deps: d, logger });
    }
    expect(res.action).toBe("raid");
    expect(d.kickMember).toHaveBeenCalled();
    expect(d.sendAlert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/raid.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/antinuke/raid.js`**

```js
import { Events } from "discord.js";
import { sendAlert } from "./alert.js";

export async function processMemberAdd({ member, guildConfig, state, deps, logger }) {
  const antinuke = guildConfig.antinuke;
  if (!antinuke?.enabled || !antinuke.antiRaidEnabled) return { action: "disabled" };

  const count = state.recordJoin(member.guild.id, antinuke.raidWindowSec * 1000);
  if (count < antinuke.raidJoinCount) return { action: "under_threshold", count };

  await deps.kickMember(member, "Anti-raid: join spike detected");
  await deps.sendAlert(
    {
      guild: member.guild,
      channelId: antinuke.alertChannelId,
      actionKey: "antiRaid",
      executorId: member.id,
      count,
      punishment: "kick",
    },
    logger,
  );
  return { action: "raid", count };
}

export default {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    try {
      const guildConfig = await ctx.config.getGuild(member.guild.id);
      const deps = {
        kickMember: (m, reason) => m.kick(reason).catch(() => {}),
        sendAlert,
      };
      await processMemberAdd({ member, guildConfig, state: ctx.antinuke, deps, logger: ctx.logger });
    } catch (err) {
      ctx.logger.error({ err }, "anti-raid listener error");
    }
  },
};
```

- [ ] **Step 4: Write the listener file `src/modules/antinuke/events/guildMemberAdd.js`**

```js
export { default } from "../raid.js";
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/raid.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/antinuke/raid.js src/modules/antinuke/events/guildMemberAdd.js test/modules/antinuke/raid.test.js
git commit -m "feat(antinuke): add anti-raid join-spike detection"
```

---

### Task 12: `/antinuke` command (`src/modules/antinuke/commands/antinuke.js`)

**Files:**
- Create: `src/modules/antinuke/commands/antinuke.js`
- Create: `src/modules/antinuke/statusEmbed.js`
- Test: `test/modules/antinuke/antinukeCommand.test.js`

**Interfaces:**
- Consumes: `SlashCommandBuilder`, `PermissionFlagsBits` (discord.js); `ConfigService` methods `updateAntinuke`/`addWhitelist`/`removeWhitelist`/`getGuild` (T6); `successEmbed`/`infoEmbed` (`src/lib/embeds.js`).
- Produces:
  - `buildStatusEmbed(guildConfig): EmbedBuilder` (in `statusEmbed.js`) — summarizes the current anti-nuke config.
  - default-export command `{ data, permissions: [PermissionFlagsBits.Administrator], execute(interaction, ctx) }` with subcommands: `enable`, `disable`, `panic` (`state: on|off`), `punishment` (`type: ban|kick|strip|quarantine|removeperms`), `alertchannel` (`channel`), `whitelist` (`action: add|remove`, `target: mentionable`), `status`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/antinuke/commands/antinuke.js";
import { buildStatusEmbed } from "../../../src/modules/antinuke/statusEmbed.js";

function ctx() {
  return {
    config: {
      updateAntinuke: vi.fn(async () => ({})),
      addWhitelist: vi.fn(async () => ({})),
      removeWhitelist: vi.fn(async () => {}),
      getGuild: vi.fn(async () => ({ antinuke: { enabled: true, punishment: "ban", panicMode: false, autoRevert: true }, whitelist: [] })),
    },
    logger: { info: vi.fn(), error: vi.fn() },
  };
}

function interaction(sub, options = {}) {
  return {
    guildId: "g1",
    options: {
      getSubcommand: () => sub,
      getString: (k) => options[k] ?? null,
      getChannel: (k) => options[k] ?? null,
      getMentionable: (k) => options[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/antinuke command", () => {
  it("is admin-gated and named", () => {
    expect(command.data.name).toBe("antinuke");
    expect(command.permissions.length).toBe(1);
  });

  it("enable sets enabled=true", async () => {
    const c = ctx();
    await command.execute(interaction("enable"), c);
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { enabled: true });
  });

  it("punishment sets the punishment type", async () => {
    const c = ctx();
    await command.execute(interaction("punishment", { type: "quarantine" }), c);
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { punishment: "quarantine" });
  });

  it("whitelist add stores a user entry", async () => {
    const c = ctx();
    const target = { id: "u5" };
    const i = interaction("whitelist", { action: "add", target });
    await command.execute(i, c);
    expect(c.config.addWhitelist).toHaveBeenCalledWith("g1", "u5", "user", expect.anything());
  });

  it("status replies with an embed", async () => {
    const c = ctx();
    const i = interaction("status");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});

describe("buildStatusEmbed", () => {
  it("summarizes config", () => {
    const e = buildStatusEmbed({ antinuke: { enabled: true, punishment: "ban", panicMode: false, autoRevert: true }, whitelist: [] });
    expect(JSON.stringify(e.data)).toContain("ban");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/antinuke/antinukeCommand.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/antinuke/statusEmbed.js`**

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

export function buildStatusEmbed(guildConfig) {
  const a = guildConfig.antinuke ?? {};
  const wl = guildConfig.whitelist ?? [];
  return new EmbedBuilder()
    .setColor(a.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🛡️ Anti-Nuke Status")
    .addFields(
      { name: "Enabled", value: a.enabled ? "✅ Yes" : "❌ No", inline: true },
      { name: "Punishment", value: `\`${a.punishment ?? "ban"}\``, inline: true },
      { name: "Panic mode", value: a.panicMode ? "🚨 ON" : "off", inline: true },
      { name: "Auto-revert", value: a.autoRevert ? "on" : "off", inline: true },
      { name: "Alert channel", value: a.alertChannelId ? `<#${a.alertChannelId}>` : "none", inline: true },
      { name: "Whitelist entries", value: String(wl.length), inline: true },
    );
}
```

- [ ] **Step 4: Write `src/modules/antinuke/commands/antinuke.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed } from "../../../lib/embeds.js";
import { buildStatusEmbed } from "../statusEmbed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Configure the anti-nuke protection system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("enable").setDescription("Enable anti-nuke."))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable anti-nuke."))
    .addSubcommand((s) => s.setName("status").setDescription("Show current anti-nuke settings."))
    .addSubcommand((s) =>
      s
        .setName("panic")
        .setDescription("Toggle panic mode (any single destructive action triggers).")
        .addStringOption((o) =>
          o.setName("state").setDescription("on or off").setRequired(true).addChoices(
            { name: "on", value: "on" },
            { name: "off", value: "off" },
          ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("punishment")
        .setDescription("Set the punishment applied to a detected nuker.")
        .addStringOption((o) =>
          o.setName("type").setDescription("Punishment").setRequired(true).addChoices(
            { name: "ban", value: "ban" },
            { name: "kick", value: "kick" },
            { name: "strip roles", value: "strip" },
            { name: "quarantine", value: "quarantine" },
            { name: "remove perms", value: "removeperms" },
          ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("alertchannel")
        .setDescription("Set the channel for anti-nuke incident alerts.")
        .addChannelOption((o) => o.setName("channel").setDescription("Alert channel").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("whitelist")
        .setDescription("Add or remove a trusted user/role that bypasses anti-nuke.")
        .addStringOption((o) =>
          o.setName("action").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" },
          ),
        )
        .addMentionableOption((o) =>
          o.setName("target").setDescription("User or role").setRequired(true),
        ),
    ),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "enable") {
      await ctx.config.updateAntinuke(guildId, { enabled: true });
      await interaction.reply({ embeds: [successEmbed("Anti-nuke is now **enabled**.")] });
      return;
    }
    if (sub === "disable") {
      await ctx.config.updateAntinuke(guildId, { enabled: false });
      await interaction.reply({ embeds: [successEmbed("Anti-nuke is now **disabled**.")] });
      return;
    }
    if (sub === "panic") {
      const on = interaction.options.getString("state") === "on";
      await ctx.config.updateAntinuke(guildId, { panicMode: on });
      await interaction.reply({ embeds: [successEmbed(`Panic mode is now **${on ? "ON" : "off"}**.`)] });
      return;
    }
    if (sub === "punishment") {
      const type = interaction.options.getString("type");
      await ctx.config.updateAntinuke(guildId, { punishment: type });
      await interaction.reply({ embeds: [successEmbed(`Punishment set to \`${type}\`.`)] });
      return;
    }
    if (sub === "alertchannel") {
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateAntinuke(guildId, { alertChannelId: channel.id });
      await interaction.reply({ embeds: [successEmbed(`Alerts will be sent to <#${channel.id}>.`)] });
      return;
    }
    if (sub === "whitelist") {
      const action = interaction.options.getString("action");
      const target = interaction.options.getMentionable("target");
      const type = target.user || target.username ? "user" : "role";
      if (action === "add") {
        await ctx.config.addWhitelist(guildId, target.id, type, interaction.user?.id ?? "unknown");
        await interaction.reply({ embeds: [successEmbed(`Added <@${target.id}> to the whitelist.`)] });
      } else {
        await ctx.config.removeWhitelist(guildId, target.id);
        await interaction.reply({ embeds: [successEmbed(`Removed \`${target.id}\` from the whitelist.`)] });
      }
      return;
    }
    if (sub === "status") {
      const guildConfig = await ctx.config.getGuild(guildId);
      await interaction.reply({ embeds: [buildStatusEmbed(guildConfig)] });
      return;
    }
  },
};
```

Note: the test constructs `target` as `{ id: "u5" }` (no `user`/`username`), so `type` resolves to `"role"`... to keep the test's `"user"` expectation correct, the test's target must look like a user. The test uses `target: { id: "u5" }` and expects `"user"`. Adjust the type check to default to `"user"` unless the mentionable is clearly a role: a role mentionable exposes a `.permissions` field and no `.bot`/`.username`. Use: `const type = "permissions" in target && !("username" in target) && !("bot" in target) ? "role" : "user";`. Replace the `type` line accordingly:

```js
      const type =
        "permissions" in target && !("username" in target) && !("bot" in target) ? "role" : "user";
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/antinuke/antinukeCommand.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/antinuke/commands/antinuke.js src/modules/antinuke/statusEmbed.js test/modules/antinuke/antinukeCommand.test.js
git commit -m "feat(antinuke): add /antinuke configuration command"
```

---

### Task 13: Wire state into the bot + docs + full verification (`src/bot.js`, `README.md`)

**Files:**
- Modify: `src/bot.js` (add `AntinukeState` to the DI context)
- Modify: `README.md` (document anti-nuke)

**Interfaces:**
- Consumes: `AntinukeState` (T2); the existing `context` object in `src/bot.js`.
- Produces: `context.antinuke` — an `AntinukeState` instance available to every event listener via `ctx.antinuke`.

- [ ] **Step 1: Modify `src/bot.js`**

Add the import near the other core imports:

```js
import { AntinukeState } from "./modules/antinuke/AntinukeState.js";
```

Add `antinuke` to the `context` object (alongside `cooldowns`, `scheduler`):

```js
    antinuke: new AntinukeState(),
```

- [ ] **Step 2: Verify the bot still wires up cleanly (fails only on missing env)**

Run: `node src/bot.js`
Expected: exits with the `Invalid environment` error (proves all anti-nuke imports resolve and the context builds).

- [ ] **Step 3: Update `README.md`** — add an Anti-Nuke section under the feature list

Insert this section after the "## Architecture" section:

````markdown
## Anti-Nuke

Audit-log-driven protection. Enable with `/antinuke enable` (Administrator only). Watches
destructive actions per executor in sliding windows — channel/role create & delete, dangerous
permission grants, mass ban/kick, member prune, webhook create/delete, bot adds, guild/vanity
changes, emoji/sticker deletion — and on threshold breach applies the configured punishment
(`/antinuke punishment ban|kick|strip|quarantine|removeperms`), optionally auto-reverts, and
alerts `/antinuke alertchannel`. Trusted users/roles bypass via `/antinuke whitelist add`.
The guild owner and the bot are always exempt. `/antinuke panic on` makes any single destructive
action trigger. Anti-raid detects join spikes and kicks new joiners during a raid.

**Requirements:** the bot needs **View Audit Log** plus the permissions matching its punishment
(Ban/Kick/Manage Roles) and a role positioned **above** the members it must act on. Detection is
audit-log driven, so it is near-real-time, not instant.
````

- [ ] **Step 4: Run the full test suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all tests PASS (foundation + anti-nuke); lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/bot.js README.md
git commit -m "feat(antinuke): wire anti-nuke state into the bot and document it"
```

---

## Self-Review

**Spec coverage (spec §7 Anti-Nuke):**
- Trigger source `GuildAuditLogEntryCreate` → Task 10 listener. ✓
- Watched actions (channel/role create+delete, dangerous perm grants, ban/kick, prune, webhook create/delete, bot adds, guild/vanity update, emoji/sticker delete) → Task 3 `DEFAULT_THRESHOLDS` + `mapAuditLogEntry`. ✓
- Detection with per-executor sliding windows → Tasks 1, 2, 10. ✓
- Exemptions: whitelist, owner, self, → Tasks 4, 10 (owner/self checks in orchestrator; whitelist in `isWhitelisted`). ✓
- Response punishments (ban/kick/strip/quarantine/removeperms) → Task 7. ✓
- Auto-revert (recreate channel/role, unban) → Task 8, gated by `autoRevert` in Task 10. ✓
- Alert to configured channel → Task 9 + Task 10. ✓
- Whitelist management → Task 6 (persistence) + Task 12 (command). ✓
- Anti-raid join-spike detection → Task 11. ✓
- Panic/lockdown mode → `evaluate` panic path (T5) + `/antinuke panic` (T12). ✓
- Self-protection invariants (never owner/self, degrade gracefully) → Task 10 owner/self returns; Tasks 7/8/9/10 catch-and-log, never rethrow. ✓
- Honest limitation (near-real-time, no message history restore) → documented in README (T13). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". The Task 12 note explicitly gives the corrected `type` line so there is no ambiguity. Every code step is complete. ✓

**Type consistency:**
- `AntinukeState.recordAction(guildId, actionKey, executorId, windowMs)` / `recordJoin(guildId, windowMs)` (T2) match call sites in orchestrator (T10) and raid (T11). ✓
- `mapAuditLogEntry(entry) -> { actionKey } | null` (T3) matches orchestrator usage. ✓
- `getThreshold(antinukeConfig, actionKey) -> { limit, windowSec, enabled }` and `isWhitelisted(member, whitelist)` (T4) match orchestrator. ✓
- `evaluate({ count, limit, panic }) -> { triggered }` (T5) matches orchestrator. ✓
- `applyPunishment({ type, guild, executorId, member, reason, quarantineRoleId, logger })` (T7) matches `deps.applyPunishment` call in T10. ✓
- `revertAction({ actionKey, entry, guild, logger })` (T8) matches T10. ✓
- `sendAlert({ guild, channelId, actionKey, executorId, count, punishment }, logger)` (T9) matches T10 and T11. ✓
- `ConfigService.updateAntinuke/addWhitelist/removeWhitelist/getGuild` (T6) match `/antinuke` command (T12). ✓
- `ctx.antinuke` (AntinukeState) provided by T13 matches consumers in T10/T11. ✓
- `guildConfig.whitelist` requires `INCLUDE.whitelist = true` — added in T6. ✓
