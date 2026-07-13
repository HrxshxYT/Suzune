# Watch VC — Guard Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-server "guard" presence: the bot silently sits in one admin-chosen, locked-but-visible voice channel and shows a live `🛡️ Guarding N members` channel status, holding the channel across restarts and moves.

**Architecture:** New `src/modules/watchvc/` module mirroring `src/modules/welcome/`. Pure helpers (status text, lock overwrites, reconnect decision) are unit-tested in isolation; a `WatchVcService` orchestrator holds voice connections and timers, taking injected voice/REST deps so it is testable without a live gateway. A single `/watchvc` slash command opens a `runPanel` control panel. Config persists in a new Prisma `WatchVcConfig` table via `ConfigService`.

**Tech Stack:** Node ≥25 (ESM), discord.js 14.26.4, `@discordjs/voice` + `libsodium-wrappers` (new), Prisma/PostgreSQL, Vitest.

## Global Constraints

- ESM only (`import`/`export`), Node ≥25.
- Follow existing module conventions: `commands/`, `events/`, `panel/{index,render,handlers}.js`, a `Service`/pure-helper split, `ctx`-threaded events (`execute(ctx, ...args)`).
- Config writes go through `ConfigService` (getGuild → upsert → invalidate), never raw Prisma in feature code.
- Status text: exactly `🛡️ Guarding {memberCount} members`, from `guild.memberCount` (all members incl. bots).
- Voice connection is **selfMute: false, selfDeaf: false**, and never plays audio (silent).
- Channel lock = `@everyone` overwrite `ViewChannel: allow`, `Connect: deny`; bot keeps `Connect`.
- Status refresh debounced to at most once / 45s per guild.
- Reconnect uses capped backoff (5s base) and gives up after 5 consecutive failures.
- Disable does NOT revert channel permission overwrites.
- Discord.js 14.26.4 has no `setVoiceStatus`; set status via `client.rest.put(\`/channels/${id}/voice-status\`, { body: { status } })`.
- Admin-only command (`PermissionFlagsBits.Administrator`).

---

### Task 1: Data layer — `WatchVcConfig` model + `ConfigService`

**Files:**
- Modify: `prisma/schema.prisma` (add model + Guild relation)
- Modify: `src/core/ConfigService.js` (INCLUDE, `updateWatchVc`, `resetGuildConfig`)
- Test: `test/core/ConfigService.watchvc.test.js`

**Interfaces:**
- Produces: `ConfigService.updateWatchVc(guildId, data) -> Promise<row>`; `getGuild(guildId).watchVc` is `{ guildId, channelId, enabled } | null`.

- [ ] **Step 1: Write the failing test** — `test/core/ConfigService.watchvc.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", watchVc: null })),
      create: vi.fn(async ({ data }) => ({ ...data, watchVc: null })),
    },
    watchVcConfig: { upsert: vi.fn(async ({ create, update }) => ({ ...create, ...update })) },
  };
}

describe("ConfigService watchVc", () => {
  it("upserts watch-vc config and invalidates cache", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    await svc.updateWatchVc("g1", { channelId: "c1", enabled: true });
    expect(prisma.watchVcConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: "g1" } }),
    );
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** — `npx vitest run test/core/ConfigService.watchvc.test.js` → fails (`updateWatchVc is not a function`).

- [ ] **Step 3: Implement.** In `src/core/ConfigService.js`: add `watchVc: true` to the `INCLUDE` object; add method mirroring `updateWelcome`:

```js
  async updateWatchVc(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.watchVcConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }
```

Add to `resetGuildConfig` (with the other deleteMany calls): `await this.prisma.watchVcConfig.deleteMany({ where: { guildId } });`

In `prisma/schema.prisma`: add `watchVc  WatchVcConfig?` to `model Guild`, and:

```prisma
model WatchVcConfig {
  guildId   String   @id
  guild     Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
  channelId String?
  enabled   Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 4: Run test, expect PASS** — `npx vitest run test/core/ConfigService.watchvc.test.js`.
- [ ] **Step 5: Regenerate client** — `npm run db:generate` (no DB needed). Note in commit: `npm run db:migrate` is a deploy step requiring `DATABASE_URL`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(watchvc): WatchVcConfig model + ConfigService.updateWatchVc"`

---

### Task 2: Pure helper — status text + debounce

**Files:**
- Create: `src/modules/watchvc/status.js`
- Test: `test/modules/watchvc/status.test.js`

**Interfaces:**
- Produces: `formatGuardStatus(memberCount: number) -> string`; `STATUS_DEBOUNCE_MS = 45000`; `createDebouncer(waitMs) -> { schedule(key, fn), cancel(key), cancelAll() }` (collapses rapid calls per key; uses `setTimeout`, `.unref?.()`).

- [ ] **Step 1: Failing test** — `test/modules/watchvc/status.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { formatGuardStatus, createDebouncer } from "../../../src/modules/watchvc/status.js";

describe("formatGuardStatus", () => {
  it("formats the guard badge", () => {
    expect(formatGuardStatus(1234)).toBe("🛡️ Guarding 1234 members");
    expect(formatGuardStatus(1)).toBe("🛡️ Guarding 1 members");
  });
});

describe("createDebouncer", () => {
  it("collapses rapid calls per key into one", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createDebouncer(45000);
    d.schedule("g1", fn);
    d.schedule("g1", fn);
    d.schedule("g1", fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(45000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("keeps separate keys independent and cancels", () => {
    vi.useFakeTimers();
    const a = vi.fn(); const b = vi.fn();
    const d = createDebouncer(1000);
    d.schedule("a", a);
    d.schedule("b", b);
    d.cancel("a");
    vi.advanceTimersByTime(1000);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run test/modules/watchvc/status.test.js`.
- [ ] **Step 3: Implement** — `src/modules/watchvc/status.js`:

```js
export const STATUS_DEBOUNCE_MS = 45000;

export function formatGuardStatus(memberCount) {
  return `🛡️ Guarding ${memberCount} members`;
}

export function createDebouncer(waitMs = STATUS_DEBOUNCE_MS) {
  const timers = new Map();
  return {
    schedule(key, fn) {
      clearTimeout(timers.get(key));
      const t = setTimeout(() => {
        timers.delete(key);
        fn();
      }, waitMs);
      t.unref?.();
      timers.set(key, t);
    },
    cancel(key) {
      clearTimeout(timers.get(key));
      timers.delete(key);
    },
    cancelAll() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(watchvc): guard status text + per-key debouncer"`

---

### Task 3: Pure helper — lock overwrites + permission preconditions

**Files:**
- Create: `src/modules/watchvc/lock.js`
- Test: `test/modules/watchvc/lock.test.js`

**Interfaces:**
- Produces:
  - `lockOverwrites(everyoneRoleId, botId) -> Array<{ id, allow: string[], deny: string[] }>` using `PermissionFlagsBits` names (`ViewChannel`, `Connect`).
  - `missingLockPermissions(perms) -> string[]` where `perms` is a discord.js `PermissionsBitField` (has `.has(flag)`); returns human labels for any missing of ManageChannels/Connect/ViewChannel.

- [ ] **Step 1: Failing test** — `test/modules/watchvc/lock.test.js`:

```js
import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { lockOverwrites, missingLockPermissions } from "../../../src/modules/watchvc/lock.js";

describe("lockOverwrites", () => {
  it("denies Connect + allows View for @everyone and grants bot Connect", () => {
    const ows = lockOverwrites("everyone-id", "bot-id");
    const everyone = ows.find((o) => o.id === "everyone-id");
    const bot = ows.find((o) => o.id === "bot-id");
    expect(everyone.allow).toContain("ViewChannel");
    expect(everyone.deny).toContain("Connect");
    expect(bot.allow).toContain("Connect");
    expect(bot.allow).toContain("ViewChannel");
  });
});

describe("missingLockPermissions", () => {
  const perms = (has) => ({ has: (f) => has.includes(f) });
  it("returns empty when all present", () => {
    const all = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel];
    expect(missingLockPermissions(perms(all))).toEqual([]);
  });
  it("reports missing Manage Channels and Connect", () => {
    const out = missingLockPermissions(perms([PermissionFlagsBits.ViewChannel]));
    expect(out).toContain("Manage Channels");
    expect(out).toContain("Connect");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** — `src/modules/watchvc/lock.js`:

```js
import { PermissionFlagsBits } from "discord.js";

// Overwrite payloads use string flag names, which channel.permissionOverwrites.set accepts.
export function lockOverwrites(everyoneRoleId, botId) {
  return [
    { id: everyoneRoleId, allow: ["ViewChannel"], deny: ["Connect"] },
    { id: botId, allow: ["ViewChannel", "Connect"], deny: [] },
  ];
}

export function missingLockPermissions(perms) {
  const required = [
    [PermissionFlagsBits.ManageChannels, "Manage Channels"],
    [PermissionFlagsBits.Connect, "Connect"],
    [PermissionFlagsBits.ViewChannel, "View Channel"],
  ];
  return required.filter(([flag]) => !perms.has(flag)).map(([, label]) => label);
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(watchvc): lock overwrites + permission preconditions"`

---

### Task 4: Pure helper — reconnect decision + backoff

**Files:**
- Create: `src/modules/watchvc/reconnect.js`
- Test: `test/modules/watchvc/reconnect.test.js`

**Interfaces:**
- Produces:
  - `shouldReturnToPost({ enabled, configuredChannelId, currentChannelId }) -> boolean` (true when enabled, a channel is configured, and the bot is not currently in it).
  - `backoffMs(attempt, { base = 5000, cap = 60000 } = {}) -> number` (exponential, capped).
  - `MAX_RECONNECT_ATTEMPTS = 5`.

- [ ] **Step 1: Failing test** — `test/modules/watchvc/reconnect.test.js`:

```js
import { describe, it, expect } from "vitest";
import { shouldReturnToPost, backoffMs, MAX_RECONNECT_ATTEMPTS } from "../../../src/modules/watchvc/reconnect.js";

describe("shouldReturnToPost", () => {
  it("returns true when moved off the configured channel while enabled", () => {
    expect(shouldReturnToPost({ enabled: true, configuredChannelId: "c1", currentChannelId: "c2" })).toBe(true);
    expect(shouldReturnToPost({ enabled: true, configuredChannelId: "c1", currentChannelId: null })).toBe(true);
  });
  it("returns false when already in the configured channel, disabled, or unconfigured", () => {
    expect(shouldReturnToPost({ enabled: true, configuredChannelId: "c1", currentChannelId: "c1" })).toBe(false);
    expect(shouldReturnToPost({ enabled: false, configuredChannelId: "c1", currentChannelId: null })).toBe(false);
    expect(shouldReturnToPost({ enabled: true, configuredChannelId: null, currentChannelId: null })).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows exponentially and caps", () => {
    expect(backoffMs(0)).toBe(5000);
    expect(backoffMs(1)).toBe(10000);
    expect(backoffMs(2)).toBe(20000);
    expect(backoffMs(10)).toBe(60000);
  });
  it("exposes a max attempt count", () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(5);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** — `src/modules/watchvc/reconnect.js`:

```js
export const MAX_RECONNECT_ATTEMPTS = 5;

export function shouldReturnToPost({ enabled, configuredChannelId, currentChannelId }) {
  if (!enabled || !configuredChannelId) return false;
  return currentChannelId !== configuredChannelId;
}

export function backoffMs(attempt, { base = 5000, cap = 60000 } = {}) {
  return Math.min(base * 2 ** attempt, cap);
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(watchvc): reconnect decision + capped backoff"`

---

### Task 5: `WatchVcService` orchestrator (injected voice deps)

**Files:**
- Create: `src/modules/watchvc/deps.js` (real voice/REST deps)
- Create: `src/modules/watchvc/WatchVcService.js`
- Test: `test/modules/watchvc/WatchVcService.test.js`

**Interfaces:**
- Consumes: `formatGuardStatus`, `createDebouncer`, `lockOverwrites`, `missingLockPermissions`, `shouldReturnToPost`, `backoffMs`, `MAX_RECONNECT_ATTEMPTS`.
- Produces (constructed as `new WatchVcService({ client, logger, config, deps })`):
  - `async enable(channel) -> { ok: true } | { ok: false, error: string }` — checks perms, applies lock, joins, writes status, persists `{ channelId, enabled: true }`.
  - `async disable(guildId) -> void` — destroys connection, clears status, persists `{ enabled: false }`.
  - `async reassert(guildId) -> { ok, error? }` — re-lock + rejoin + refresh status for the configured channel.
  - `refreshStatus(guildId)` — debounced; recomputes member count and PUTs status.
  - `async restoreAll()` — startup rejoin of all `enabled` guilds.
  - `handleVoiceStateUpdate(oldState, newState)` — return-to-post on self-move.
  - `currentChannelId(guildId) -> string | null`.
- `deps` shape (so tests inject fakes): `{ join(channel) -> connection, ready(connection, timeoutMs) -> Promise, destroy(connection), onDisconnect(connection, cb), setStatus(channelId, status) -> Promise, clearStatus(channelId) -> Promise }`.

- [ ] **Step 1: Failing test** — `test/modules/watchvc/WatchVcService.test.js` (mock config + deps; assert enable path checks perms, joins, writes status, persists; disable clears; refreshStatus is debounced):

```js
import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { WatchVcService } from "../../../src/modules/watchvc/WatchVcService.js";

function fakeChannel({ perms = "all" } = {}) {
  const has = perms === "all"
    ? () => true
    : (f) => f !== PermissionFlagsBits.ManageChannels;
  return {
    id: "c1",
    guildId: "g1",
    guild: {
      id: "g1",
      memberCount: 42,
      roles: { everyone: { id: "everyone-id" } },
      members: { me: { id: "bot-id" } },
    },
    permissionsFor: () => ({ has }),
    permissionOverwrites: { set: vi.fn(async () => {}) },
  };
}

function fakeDeps() {
  const connection = { id: "conn" };
  return {
    connection,
    join: vi.fn(() => connection),
    ready: vi.fn(async () => {}),
    destroy: vi.fn(),
    onDisconnect: vi.fn(),
    setStatus: vi.fn(async () => {}),
    clearStatus: vi.fn(async () => {}),
  };
}

function fakeConfig() {
  return { updateWatchVc: vi.fn(async () => {}), getGuild: vi.fn(async () => ({ watchVc: null })) };
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("WatchVcService.enable", () => {
  it("locks, joins, writes status, and persists when perms are present", async () => {
    const deps = fakeDeps();
    const config = fakeConfig();
    const svc = new WatchVcService({ client: {}, logger, config, deps });
    const ch = fakeChannel();
    const res = await svc.enable(ch);
    expect(res.ok).toBe(true);
    expect(ch.permissionOverwrites.set).toHaveBeenCalled();
    expect(deps.join).toHaveBeenCalledWith(ch);
    expect(deps.setStatus).toHaveBeenCalledWith("c1", "🛡️ Guarding 42 members");
    expect(config.updateWatchVc).toHaveBeenCalledWith("g1", { channelId: "c1", enabled: true });
    expect(svc.currentChannelId("g1")).toBe("c1");
  });

  it("fails fast without side effects when Manage Channels is missing", async () => {
    const deps = fakeDeps();
    const svc = new WatchVcService({ client: {}, logger, config: fakeConfig(), deps });
    const ch = fakeChannel({ perms: "no-manage" });
    const res = await svc.enable(ch);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Manage Channels/);
    expect(deps.join).not.toHaveBeenCalled();
  });
});

describe("WatchVcService.disable", () => {
  it("destroys, clears status, persists disabled", async () => {
    const deps = fakeDeps();
    const config = fakeConfig();
    const svc = new WatchVcService({ client: {}, logger, config, deps });
    await svc.enable(fakeChannel());
    await svc.disable("g1");
    expect(deps.destroy).toHaveBeenCalledWith(deps.connection);
    expect(deps.clearStatus).toHaveBeenCalledWith("c1");
    expect(config.updateWatchVc).toHaveBeenCalledWith("g1", { enabled: false });
    expect(svc.currentChannelId("g1")).toBe(null);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** — `src/modules/watchvc/WatchVcService.js`. Key logic:
  - Maintain `this.connections = new Map()` (guildId → `{ channelId, connection }`) and `this.debouncer = createDebouncer()`.
  - `enable(channel)`: `me = channel.guild.members.me`; `missing = missingLockPermissions(channel.permissionsFor(me))`; if non-empty → return `{ ok:false, error: \`Missing permissions: ${missing.join(", ")}\` }`. Else `await channel.permissionOverwrites.set(lockOverwrites(channel.guild.roles.everyone.id, me.id))`; `const connection = this.deps.join(channel); await this.deps.ready(connection, 15000); this.deps.onDisconnect(connection, () => this._onDisconnect(channel.guildId));` store; `await this.deps.setStatus(channel.id, formatGuardStatus(channel.guild.memberCount))`; `await this.config.updateWatchVc(guildId, { channelId, enabled: true })`; return `{ ok: true }`. Wrap in try/catch → `{ ok:false, error }` and log.
  - `disable(guildId)`: look up entry; if present `this.deps.destroy(connection)`, `await this.deps.clearStatus(channelId)`, delete from map, cancel debounce; `await this.config.updateWatchVc(guildId, { enabled: false })`.
  - `refreshStatus(guildId)`: `this.debouncer.schedule(guildId, () => this._doRefresh(guildId))`.
  - `_doRefresh(guildId)`: entry = map.get; guild = `this.client.guilds?.cache?.get(guildId)`; if entry+guild → `this.deps.setStatus(entry.channelId, formatGuardStatus(guild.memberCount)).catch(log)`.
  - `reassert(guildId)`: resolve configured channel from `config.getGuild` + `client`, call an internal `_join(channel)` that reuses enable's lock+join+status without re-persisting `channelId`. (Reuse a private `_engage(channel, persist)` used by both enable and reassert to stay DRY.)
  - `restoreAll()`: for each guild in `client.guilds.cache`, `gc = await config.getGuild(id)`; if `gc.watchVc?.enabled && gc.watchVc.channelId` → resolve channel, `_engage(channel, false)` with try/catch+log; skip missing channels.
  - `handleVoiceStateUpdate(oldState, newState)`: `if (newState.id !== this.client.user?.id) return;` compute `currentChannelId = newState.channelId`; look up configured (`config.getGuild`); if `shouldReturnToPost({ enabled, configuredChannelId, currentChannelId })` → schedule reconnect with `backoffMs(attempt)` up to `MAX_RECONNECT_ATTEMPTS`, resetting the attempt counter on success.
  - `currentChannelId(guildId)`: `this.connections.get(guildId)?.channelId ?? null`.
  - Guard every async Discord call in try/catch; log via `this.logger`.
- Create `src/modules/watchvc/deps.js` — real deps using `@discordjs/voice`:

```js
import { joinVoiceChannel, entersState, VoiceConnectionStatus, getVoiceConnection } from "@discordjs/voice";

export function realDeps(client) {
  return {
    join(channel) {
      return joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfMute: false,
        selfDeaf: false,
      });
    },
    ready(connection, timeoutMs = 15000) {
      return entersState(connection, VoiceConnectionStatus.Ready, timeoutMs);
    },
    destroy(connection) {
      try { connection.destroy(); } catch { /* already destroyed */ }
    },
    onDisconnect(connection, cb) {
      connection.on(VoiceConnectionStatus.Disconnected, cb);
    },
    setStatus(channelId, status) {
      return client.rest.put(`/channels/${channelId}/voice-status`, { body: { status } });
    },
    clearStatus(channelId) {
      return client.rest.put(`/channels/${channelId}/voice-status`, { body: { status: "" } });
    },
    getConnection: getVoiceConnection,
  };
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run test/modules/watchvc/WatchVcService.test.js`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(watchvc): WatchVcService orchestrator + real voice deps"`

---

### Task 6: Control panel (render / handlers / index)

**Files:**
- Create: `src/modules/watchvc/panel/render.js`
- Create: `src/modules/watchvc/panel/handlers.js`
- Create: `src/modules/watchvc/panel/index.js`
- Test: `test/modules/watchvc/panel.test.js`

**Interfaces:**
- Consumes: `WatchVcService` (via `ctx.watchvc`), `runPanel`, `formatGuardStatus`.
- Produces: `buildWatchVcView(state) -> { embeds, components }`; `handleWatchVcComponent(i, state, ctx, render) -> "close"|"update"|"handled"`; `runWatchVcPanel(interaction, ctx)`.
- CustomId scheme: `wv:<kind>:<owner>` where kind ∈ `ch` (channel select), `toggle`, `reassert`, `close`.
- Panel `state`: `{ guildId, ownerId, watchVc: { channelId, enabled } }`.

- [ ] **Step 1: Failing test** — `test/modules/watchvc/panel.test.js` covering render (enabled/disabled color + channel mention; toggle disabled when no channel) and handlers (`ch` sets channel; `toggle` calls enable/disable; `close` returns "close"):

```js
import { describe, it, expect, vi } from "vitest";
import { buildWatchVcView } from "../../../src/modules/watchvc/panel/render.js";
import { handleWatchVcComponent } from "../../../src/modules/watchvc/panel/handlers.js";

const owner = "o1";
const baseState = () => ({ guildId: "g1", ownerId: owner, watchVc: { channelId: null, enabled: false } });

describe("buildWatchVcView", () => {
  it("shows off state and disables toggle when no channel selected", () => {
    const view = buildWatchVcView(baseState());
    expect(view.embeds).toHaveLength(1);
    const flat = view.components.flatMap((r) => r.components);
    const toggle = flat.find((c) => c.data.custom_id === `wv:toggle:${owner}`);
    expect(toggle.data.disabled).toBe(true);
  });
  it("enables toggle once a channel is set", () => {
    const s = baseState(); s.watchVc.channelId = "c1";
    const view = buildWatchVcView(s);
    const toggle = view.components.flatMap((r) => r.components).find((c) => c.data.custom_id === `wv:toggle:${owner}`);
    expect(toggle.data.disabled).toBe(false);
  });
});

describe("handleWatchVcComponent", () => {
  it("selecting a channel stores it in state and config", async () => {
    const s = baseState();
    const ctx = { config: { updateWatchVc: vi.fn(async () => {}) } };
    const i = { customId: `wv:ch:${owner}`, values: ["c9"] };
    const out = await handleWatchVcComponent(i, s, ctx, () => ({}));
    expect(s.watchVc.channelId).toBe("c9");
    expect(ctx.config.updateWatchVc).toHaveBeenCalledWith("g1", { channelId: "c9" });
    expect(out).toBe("update");
  });

  it("toggle -> enable resolves the channel and calls service.enable", async () => {
    const s = baseState(); s.watchVc.channelId = "c9";
    const channel = { id: "c9" };
    const enable = vi.fn(async () => ({ ok: true }));
    const ctx = {
      watchvc: { enable, disable: vi.fn() },
      client: { channels: { fetch: vi.fn(async () => channel) } },
    };
    const i = { customId: `wv:toggle:${owner}`, reply: vi.fn(async () => {}) };
    const out = await handleWatchVcComponent(i, s, ctx, () => ({}));
    expect(enable).toHaveBeenCalledWith(channel);
    expect(s.watchVc.enabled).toBe(true);
    expect(out).toBe("update");
  });

  it("close returns close", async () => {
    const out = await handleWatchVcComponent({ customId: `wv:close:${owner}` }, baseState(), {}, () => ({}));
    expect(out).toBe("close");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the three files, mirroring `welcome/panel/*`:
  - `render.js`: `EmbedBuilder` (color `COLORS.success` if enabled else `COLORS.warn`), title `🛡️ Watch VC — Guard Panel`, description lines: state (`🟢 guarding <#id>` / `🔴 off`), configured channel, and note "Locked & visible; bot sits silently." Row 1: `ChannelSelectMenuBuilder` id `wv:ch:${o}`, `addChannelTypes(ChannelType.GuildVoice)`, min/max 1, placeholder "Voice channel to guard". Row 2: toggle `ButtonBuilder` id `wv:toggle:${o}` (label `🟢 Guarding`/`🔴 Enable`, style Success/Secondary, `.setDisabled(!channelId)`), re-assert `wv:reassert:${o}` (Primary, "Re-assert", disabled if `!enabled`), close `wv:close:${o}` (Danger).
  - `handlers.js`: split `i.customId` by `:`; `close` → `"close"`; `ch` → set `state.watchVc.channelId = i.values[0]`, `await ctx.config.updateWatchVc(guildId, { channelId })`, return `"update"`; `toggle` → if not enabled: `const channel = await ctx.client.channels.fetch(state.watchVc.channelId); const res = await ctx.watchvc.enable(channel);` if `!res.ok` → `await i.reply({ ephemeral:true, embeds:[errorEmbed(...)] })` (import `errorEmbed` from `../../../lib/embeds.js`) and return `"handled"`; else `state.watchVc.enabled = true`, return `"update"`. If enabled: `await ctx.watchvc.disable(guildId); state.watchVc.enabled = false; return "update";`. `reassert` → `const res = await ctx.watchvc.reassert(guildId)`; reply ephemeral ok/err, return `"handled"`.
  - `index.js`: mirror `welcome/panel/index.js` — load `gc = await ctx.config.getGuild(guildId)`, `state.watchVc = { channelId: gc.watchVc?.channelId ?? null, enabled: gc.watchVc?.enabled ?? false }`, `runPanel({ interaction, ownerId, render: () => buildWatchVcView(state), handle: (i,r)=>handleWatchVcComponent(i,state,ctx,r), awaitFn: ctx.awaitFn })`.
- [ ] **Step 4: Run, expect PASS** (check `embeds`/`errorEmbed` helper names exist in `src/lib/embeds.js`; use whatever the file exports — verify before writing).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(watchvc): control panel (render/handlers/index)"`

---

### Task 7: Slash command

**Files:**
- Create: `src/modules/watchvc/commands/watchvc.js`
- Test: `test/modules/watchvc/command.test.js`

**Interfaces:**
- Consumes: `runWatchVcPanel`.
- Produces: default export `{ data: SlashCommandBuilder, permissions, execute }`.

- [ ] **Step 1: Failing test** — assert the command name/description and that `execute` delegates:

```js
import { describe, it, expect, vi } from "vitest";
import cmd from "../../../src/modules/watchvc/commands/watchvc.js";

describe("/watchvc command", () => {
  it("is named watchvc and is admin-gated", () => {
    const json = cmd.data.toJSON();
    expect(json.name).toBe("watchvc");
    expect(json.description).toMatch(/guard/i);
    expect(cmd.data.default_member_permissions).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** — mirror `welcome/commands/welcome.js`:

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runWatchVcPanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("watchvc")
    .setDescription("Open the Watch VC guard-presence panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runWatchVcPanel(interaction, ctx),
};
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(watchvc): /watchvc panel command"`

---

### Task 8: Events (ready, voiceStateUpdate, member add/remove)

**Files:**
- Create: `src/modules/watchvc/events/ready.js`
- Create: `src/modules/watchvc/events/voiceStateUpdate.js`
- Create: `src/modules/watchvc/events/guildMemberAdd.js`
- Create: `src/modules/watchvc/events/guildMemberRemove.js`
- Test: `test/modules/watchvc/events.test.js`

**Interfaces:**
- Consumes: `ctx.watchvc` (`restoreAll`, `handleVoiceStateUpdate`, `refreshStatus`).
- Produces: four default-export listener objects `{ name, [once], execute(ctx, ...args) }`.

- [ ] **Step 1: Failing test** — import each listener; assert `.name` matches the `Events.*` value and `execute` calls the right service method:

```js
import { describe, it, expect, vi } from "vitest";
import { Events } from "discord.js";
import ready from "../../../src/modules/watchvc/events/ready.js";
import vsu from "../../../src/modules/watchvc/events/voiceStateUpdate.js";
import add from "../../../src/modules/watchvc/events/guildMemberAdd.js";
import remove from "../../../src/modules/watchvc/events/guildMemberRemove.js";

describe("watchvc events", () => {
  it("ready restores all guards on startup", async () => {
    const ctx = { watchvc: { restoreAll: vi.fn(async () => {}) }, logger: { info: vi.fn() } };
    expect(ready.name).toBe(Events.ClientReady);
    await ready.execute(ctx, {});
    expect(ctx.watchvc.restoreAll).toHaveBeenCalled();
  });
  it("voiceStateUpdate forwards to the service", async () => {
    const ctx = { watchvc: { handleVoiceStateUpdate: vi.fn(async () => {}) } };
    expect(vsu.name).toBe(Events.VoiceStateUpdate);
    await vsu.execute(ctx, { a: 1 }, { b: 2 });
    expect(ctx.watchvc.handleVoiceStateUpdate).toHaveBeenCalledWith({ a: 1 }, { b: 2 });
  });
  it("member add/remove refresh the guild status", async () => {
    const ctx = { watchvc: { refreshStatus: vi.fn() } };
    expect(add.name).toBe(Events.GuildMemberAdd);
    expect(remove.name).toBe(Events.GuildMemberRemove);
    add.execute(ctx, { guild: { id: "g1" } });
    remove.execute(ctx, { guild: { id: "g1" } });
    expect(ctx.watchvc.refreshStatus).toHaveBeenCalledWith("g1");
    expect(ctx.watchvc.refreshStatus).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the four listeners:
  - `ready.js`: `{ name: Events.ClientReady, once: true, async execute(ctx){ await ctx.watchvc.restoreAll(); ctx.logger.info?.("watchvc guards restored"); } }`.
  - `voiceStateUpdate.js`: `{ name: Events.VoiceStateUpdate, async execute(ctx, oldState, newState){ await ctx.watchvc.handleVoiceStateUpdate(oldState, newState); } }`.
  - `guildMemberAdd.js`: `{ name: Events.GuildMemberAdd, execute(ctx, member){ ctx.watchvc.refreshStatus(member.guild.id); } }`.
  - `guildMemberRemove.js`: `{ name: Events.GuildMemberRemove, execute(ctx, member){ ctx.watchvc.refreshStatus(member.guild.id); } }`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(watchvc): startup restore, return-to-post, live count events"`

---

### Task 9: Dependencies + wire into `bot.js` + full verification

**Files:**
- Modify: `package.json` (deps) via `npm install`
- Modify: `src/bot.js` (import service + deps, add to context)
- Test: existing suite + lint

- [ ] **Step 1: Install runtime deps** — `npm install @discordjs/voice libsodium-wrappers` (libsodium-wrappers is pure-wasm; no native toolchain needed).
- [ ] **Step 2: Wire the service** in `src/bot.js`: add imports
  `import { WatchVcService } from "./modules/watchvc/WatchVcService.js";`
  `import { realDeps as watchVcDeps } from "./modules/watchvc/deps.js";`
  and in the `context` object add:
  `watchvc: new WatchVcService({ client, logger, config: ... , deps: watchVcDeps(client) }),`
  Since `context.config` is constructed inline, construct `const config = new ConfigService(prisma);` first, reference it for both `config:` and the service. Adjust: pull `config` out to a `const` above `context` and reuse.
- [ ] **Step 3: Run the FULL test suite** — `npx vitest run` → all pass.
- [ ] **Step 4: Lint** — `npx eslint .` → clean (fix any issues).
- [ ] **Step 5: Module-load smoke check** — `node -e "import('./src/modules/watchvc/WatchVcService.js').then(()=>console.log('ok'))"` → prints `ok` (verifies `@discordjs/voice` resolves and the module graph loads).
- [ ] **Step 6: Regenerate Prisma client** — `npm run db:generate`.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(watchvc): install voice deps + wire WatchVcService into bot"`

---

## Deploy notes (not code steps)

- Run `npm run db:migrate` against the production DB to create the `WatchVcConfig` table (needs `DATABASE_URL`).
- Run `npm run register` to publish the new `/watchvc` command.
- Invite/permission the bot with **Manage Channels** + **Connect** + **View Channel** on target guilds.
- `MessageContent`/voice intents already present; no gateway change.

## Self-Review

- **Spec coverage:** panel command (T6/T7) ✓; per-guild config (T1) ✓; silent unmuted/undeafened connection (T5 deps) ✓; locked-but-visible enforce + perms (T3/T5) ✓; live debounced `🛡️ Guarding N members` (T2/T5/T8) ✓; startup restore + return-to-post + backoff (T4/T5/T8) ✓; disable leaves perms (T5) ✓; new deps (T9) ✓; tests each task ✓.
- **Placeholders:** none — all steps carry real code/commands.
- **Type consistency:** `enable/disable/reassert/refreshStatus/restoreAll/handleVoiceStateUpdate/currentChannelId` and deps `join/ready/destroy/onDisconnect/setStatus/clearStatus` used identically in T5/T6/T8. CustomId `wv:<kind>:<owner>` consistent across render/handlers. `formatGuardStatus` output string identical in T2/T5 tests.
- **Note for executor:** before Task 6 Step 3, verify the exact export names in `src/lib/embeds.js` (use `errorEmbed`/`infoEmbed` as they are actually exported).
