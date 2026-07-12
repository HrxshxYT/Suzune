# Phase 2e — `/ping` sparkline, `/avatar`, `/welcome` panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an image `/ping` health card with a latency sparkline, an `/avatar` command, and convert `/welcome` from subcommands into an interactive control panel — reusing the existing canvas, panel, and config infrastructure.

**Architecture:** A shared card-font helper (`src/lib/cardFont.js` + `src/assets/DejaVuSans.ttf`) is used by both the new ping card and the existing leveling card. Ping latency is sampled into an in-memory `PingHistory` ring buffer (per shard) and rendered as a sparkline. `/avatar` is a pure-helper-backed embed. `/welcome` becomes a `runPanel` control panel mirroring the antinuke/automod panels, leaving the welcome member-event listeners untouched.

**Tech Stack:** Node.js 25 (ESM), discord.js v14 (`SlashCommandBuilder`, `AttachmentBuilder`, select/button/modal builders, `Events`), `@napi-rs/canvas`, Vitest.

## Global Constraints

- **Node.js 25**, ES modules only; discord.js v14 API surface only.
- **Reuse, do NOT re-implement:** `@napi-rs/canvas`, `ConfigService.updateWelcome` (`src/core/ConfigService.js`), `runPanel` (`src/lib/panel.js`), `renderTemplate` (`src/modules/welcome/render.js`), `brandEmbed`/`successEmbed`/`errorEmbed` (`src/lib/embeds.js`), `COLORS`/`EMOJIS` (`src/lib/constants.js`).
- **Shared font:** register a single bundled `src/assets/DejaVuSans.ttf` via `src/lib/cardFont.js` as family `"BotSans"`; both ping and leveling cards use it. Registration is idempotent and wrapped in try/catch so a missing font never throws at import.
- **Panels:** max 5 action rows per view; a button row has ≤5 buttons; owner-gated; custom-ids carry an `:<ownerId>` suffix; reply ephemeral. `ComponentType`: Button=2, StringSelect=3, ChannelSelect=8. Handlers return `"update" | "handled" | "close"`.
- **`/ping` and `/avatar`:** `permissions: []`. **`/welcome`:** Administrator (`setDefaultMemberPermissions` + `permissions` array).
- **Do not touch the welcome member-event listeners** (`src/modules/welcome/events/*`, `members.js`) — only the config command changes.
- **Never throw out of a command;** reply with an ephemeral error on failure.
- **Tests:** Vitest, `*.test.js` under `test/` mirroring `src/`. Run one file with `npx vitest run <path>`.
- **Commit** after each task's tests pass (Conventional Commits: `feat(util): …`, `feat(welcome): …`, `refactor(leveling): …`).
- **Bot display name** is **Joint Jagadeesan** (`BOT_NAME`).

---

### Task 1: Shared card font

**Files:**
- Move: `src/modules/leveling/assets/DejaVuSans.ttf` → `src/assets/DejaVuSans.ttf`
- Create: `src/lib/cardFont.js`
- Modify: `src/modules/leveling/card.js` (use the shared helper)
- Test: `test/lib/cardFont.test.js`

**Interfaces:**
- Produces: `ensureCardFont() -> string` — registers the bundled font once (idempotent) and returns the family name `"BotSans"`.

- [ ] **Step 1: Move the font file (preserves the binary in git)**

Run:
```bash
mkdir -p src/assets
git mv src/modules/leveling/assets/DejaVuSans.ttf src/assets/DejaVuSans.ttf
```
Expected: the ~750KB TTF now lives at `src/assets/DejaVuSans.ttf`; `src/modules/leveling/assets/` is empty (git tracks the rename).

- [ ] **Step 2: Write the failing test**

Create `test/lib/cardFont.test.js`:
```js
import { describe, it, expect } from "vitest";
import { ensureCardFont } from "../../src/lib/cardFont.js";

describe("ensureCardFont", () => {
  it("returns the shared family name", () => {
    expect(ensureCardFont()).toBe("BotSans");
  });
  it("is idempotent (safe to call repeatedly)", () => {
    expect(ensureCardFont()).toBe("BotSans");
    expect(ensureCardFont()).toBe("BotSans");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/lib/cardFont.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/cardFont.js`**

```js
import { GlobalFonts } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const CARD_FONT = "BotSans";

const fontPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "DejaVuSans.ttf");
let registered = false;

// Registers the bundled card font once. Wrapped in try/catch so a missing/invalid
// font file falls back to the canvas default instead of throwing at import time.
export function ensureCardFont() {
  if (!registered) {
    try {
      GlobalFonts.registerFromPath(fontPath, CARD_FONT);
    } catch {
      // fall back to the library's built-in font
    }
    registered = true;
  }
  return CARD_FONT;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/lib/cardFont.test.js`
Expected: PASS.

- [ ] **Step 6: Point the leveling card at the shared font**

In `src/modules/leveling/card.js`, replace the top-of-file font block:
```js
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fontPath = join(dirname(fileURLToPath(import.meta.url)), "assets", "DejaVuSans.ttf");
try {
  GlobalFonts.registerFromPath(fontPath, "RankSans");
} catch {
  // Missing/invalid font file: fall back to the canvas library's built-in default font
  // rather than throwing at module import time.
}
```
with:
```js
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureCardFont } from "../../lib/cardFont.js";

const FONT = ensureCardFont();
```
Then replace every `"RankSans"` font string in this file (e.g. `ctx.font = "42px RankSans"`) with a template literal using `FONT` (e.g. `ctx.font = \`42px ${FONT}\``). There are 5 `ctx.font = "…px RankSans"` assignments — update all of them.

- [ ] **Step 7: Verify leveling card still renders**

Run: `npx vitest run test/modules/leveling/card.test.js`
Expected: PASS (returns a valid PNG buffer).

- [ ] **Step 8: Commit**

```bash
git add src/assets/DejaVuSans.ttf src/lib/cardFont.js src/modules/leveling/card.js test/lib/cardFont.test.js
git commit -m "refactor(leveling): extract shared cardFont helper + move bundled font to src/assets"
```

---

### Task 2: `/avatar [user]`

**Files:**
- Create: `src/modules/util/commands/avatar.js`
- Test: `test/modules/util/avatar.test.js`

**Interfaces:**
- Produces: `avatarLinks(user) -> string` — a markdown list of format download links.

- [ ] **Step 1: Write the failing test**

Create `test/modules/util/avatar.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import avatar, { avatarLinks } from "../../../src/modules/util/commands/avatar.js";

const makeUser = (over = {}) => ({
  id: "u1",
  tag: "tester#0001",
  avatar: "abcdef",
  displayAvatarURL: ({ extension }) => `https://cdn/u1.${extension}`,
  fetch: async function () { return this; },
  ...over,
});

describe("avatarLinks", () => {
  it("lists png/jpg/webp for a static avatar", () => {
    const s = avatarLinks(makeUser());
    expect(s).toContain("[PNG](https://cdn/u1.png)");
    expect(s).toContain("[WebP](https://cdn/u1.webp)");
    expect(s).not.toContain("GIF");
  });
  it("adds GIF for an animated avatar", () => {
    expect(avatarLinks(makeUser({ avatar: "a_animated" }))).toContain("[GIF](https://cdn/u1.gif)");
  });
});

describe("avatar command", () => {
  it("has a name, optional user option, and no required permissions", () => {
    expect(avatar.data.name).toBe("avatar");
    expect(avatar.permissions).toEqual([]);
    expect(avatar.data.options[0].name).toBe("user");
    expect(avatar.data.options[0].required).toBeFalsy();
  });
  it("defaults to the caller and replies with an avatar embed", async () => {
    const caller = makeUser();
    const interaction = {
      user: caller,
      options: { getUser: () => null },
      guild: { members: { fetch: vi.fn(async () => ({ avatar: null })) } },
      reply: vi.fn(async () => {}),
    };
    await avatar.execute(interaction, {});
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const json = JSON.stringify(embed.data);
    expect(json).toContain("tester#0001");
    expect(json).toContain("https://cdn/u1.png"); // image or link
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/modules/util/avatar.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/modules/util/commands/avatar.js`**

```js
import { SlashCommandBuilder } from "discord.js";
import { brandEmbed } from "../../../lib/embeds.js";

export function avatarLinks(user) {
  const formats = user.avatar?.startsWith("a_")
    ? ["png", "jpg", "webp", "gif"]
    : ["png", "jpg", "webp"];
  return formats
    .map((f) => `[${f === "webp" ? "WebP" : f.toUpperCase()}](${user.displayAvatarURL({ extension: f, size: 512 })})`)
    .join(" · ");
}

export default {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar.")
    .addUserOption((o) => o.setName("user").setDescription("The user (defaults to you)")),
  permissions: [],
  async execute(interaction, _ctx) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const user = await target.fetch().catch(() => target);
    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);

    const embed = brandEmbed({ title: `${user.tag}'s avatar` })
      .setImage(user.displayAvatarURL({ size: 512 }))
      .setDescription(avatarLinks(user));

    if (member?.avatar) {
      embed.addFields({
        name: "Server avatar",
        value: `[View](${member.displayAvatarURL({ size: 512 })})`,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/modules/util/avatar.test.js`
Expected: PASS.

- [ ] **Step 5: Verify command JSON is valid**

Run:
```bash
node --input-type=module -e "import c from './src/modules/util/commands/avatar.js'; console.log(JSON.stringify(c.data.toJSON()).slice(0,90));"
```
Expected: prints a payload containing `"name":"avatar"`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/util/commands/avatar.js test/modules/util/avatar.test.js
git commit -m "feat(util): add /avatar command"
```

---

### Task 3: PingHistory ring buffer

**Files:**
- Create: `src/lib/PingHistory.js`
- Test: `test/lib/PingHistory.test.js`

**Interfaces:**
- Produces: `class PingHistory { constructor(cap = 30); push(ping); samples() -> number[] }`.

- [ ] **Step 1: Write the failing test**

Create `test/lib/PingHistory.test.js`:
```js
import { describe, it, expect } from "vitest";
import { PingHistory } from "../../src/lib/PingHistory.js";

describe("PingHistory", () => {
  it("keeps samples in insertion order", () => {
    const h = new PingHistory(5);
    h.push(10); h.push(20); h.push(30);
    expect(h.samples()).toEqual([10, 20, 30]);
  });
  it("caps at the configured capacity, dropping oldest", () => {
    const h = new PingHistory(3);
    [1, 2, 3, 4, 5].forEach((n) => h.push(n));
    expect(h.samples()).toEqual([3, 4, 5]);
  });
  it("ignores negative pings (ws.ping is -1 before the first heartbeat)", () => {
    const h = new PingHistory(5);
    h.push(-1); h.push(42);
    expect(h.samples()).toEqual([42]);
  });
  it("samples() returns a copy, not the internal array", () => {
    const h = new PingHistory(5);
    h.push(1);
    h.samples().push(999);
    expect(h.samples()).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/lib/PingHistory.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/PingHistory.js`**

```js
// In-memory ring buffer of recent gateway latency samples (per shard).
export class PingHistory {
  constructor(cap = 30) {
    this.cap = cap;
    this.buf = [];
  }

  push(ping) {
    if (typeof ping !== "number" || ping < 0) return;
    this.buf.push(ping);
    if (this.buf.length > this.cap) this.buf.shift();
  }

  samples() {
    return [...this.buf];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/lib/PingHistory.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/PingHistory.js test/lib/PingHistory.test.js
git commit -m "feat(util): add PingHistory ring buffer"
```

---

### Task 4: Ping card (pure helpers + render)

**Files:**
- Create: `src/modules/util/pingCard.js`
- Test: `test/modules/util/pingCard.test.js`

**Interfaces:**
- Consumes: `ensureCardFont` (`src/lib/cardFont.js`).
- Produces: `formatUptime(ms) -> string`; `sparklinePoints(samples, { width, height, min, max }) -> [{x,y}]`; `buildPingCard({ samples, currentPing, uptimeMs }) -> Promise<Buffer>` (PNG).

- [ ] **Step 1: Write the failing test**

Create `test/modules/util/pingCard.test.js`:
```js
import { describe, it, expect } from "vitest";
import { formatUptime, sparklinePoints, buildPingCard } from "../../../src/modules/util/pingCard.js";

describe("formatUptime", () => {
  it("formats days/hours/minutes", () => {
    expect(formatUptime(0)).toBe("0m");
    expect(formatUptime(60_000)).toBe("1m");
    expect(formatUptime(3_600_000)).toBe("1h 0m");
    expect(formatUptime(90_061_000)).toBe("1d 1h 1m");
  });
});

describe("sparklinePoints", () => {
  it("returns [] for no samples", () => {
    expect(sparklinePoints([], { width: 100, height: 40 })).toEqual([]);
  });
  it("maps a normal series with higher values nearer the top (smaller y)", () => {
    const pts = sparklinePoints([0, 100], { width: 100, height: 40 });
    expect(pts).toEqual([{ x: 0, y: 40 }, { x: 100, y: 0 }]);
  });
  it("draws a flat line for a constant series", () => {
    const pts = sparklinePoints([30, 30], { width: 100, height: 40 });
    expect(pts.map((p) => p.y)).toEqual([40, 40]);
    expect(pts.map((p) => p.x)).toEqual([0, 100]);
  });
});

describe("buildPingCard", () => {
  it("renders a non-empty PNG (with a sparkline)", async () => {
    const buf = await buildPingCard({ samples: [40, 55, 48, 60, 52], currentPing: 52, uptimeMs: 3_600_000 });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
  it("renders a non-empty PNG in the collecting state (<2 samples)", async () => {
    const buf = await buildPingCard({ samples: [], currentPing: -1, uptimeMs: 0 });
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/modules/util/pingCard.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/modules/util/pingCard.js`**

```js
import { createCanvas } from "@napi-rs/canvas";
import { ensureCardFont } from "../../lib/cardFont.js";

const FONT = ensureCardFont();
const W = 700;
const H = 240;

export function formatUptime(ms) {
  if (!ms || ms < 0) return "0m";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (d || h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

// Maps samples to canvas points; higher latency = nearer the top (smaller y).
export function sparklinePoints(samples, { width, height, min, max }) {
  if (!samples.length) return [];
  const lo = min ?? Math.min(...samples);
  const hi = max ?? Math.max(...samples);
  const range = hi - lo || 1;
  const n = samples.length;
  return samples.map((v, i) => ({
    x: n === 1 ? 0 : (i / (n - 1)) * width,
    y: height - ((v - lo) / range) * height,
  }));
}

function pingColor(ping) {
  if (ping < 0) return "#9fb3ab";
  if (ping <= 150) return "#2ecc71";
  if (ping <= 300) return "#fee75c";
  return "#ed4245";
}

export async function buildPingCard({ samples, currentPing, uptimeMs }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1f2724";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(0, 0, 10, H);

  ctx.fillStyle = "#ffffff";
  ctx.font = `30px ${FONT}`;
  ctx.fillText("🏓 Bot Health", 40, 55);

  // Current latency (big, colored)
  ctx.fillStyle = pingColor(currentPing);
  ctx.font = `64px ${FONT}`;
  ctx.fillText(currentPing < 0 ? "—" : `${currentPing}ms`, 40, 130);

  ctx.fillStyle = "#9fb3ab";
  ctx.font = `24px ${FONT}`;
  ctx.fillText(`Uptime: ${formatUptime(uptimeMs)}`, 40, 170);

  // Sparkline (or collecting state)
  const gx = 40, gy = 185, gw = W - 80, gh = 35;
  if (samples.length >= 2) {
    const pts = sparklinePoints(samples, { width: gw, height: gh });
    ctx.strokeStyle = "#2ecc71";
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = gx + p.x;
      const y = gy + p.y;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  } else {
    ctx.fillStyle = "#9fb3ab";
    ctx.font = `20px ${FONT}`;
    ctx.fillText("collecting latency data…", gx, gy + 24);
  }

  return canvas.toBuffer("image/png");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/modules/util/pingCard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/util/pingCard.js test/modules/util/pingCard.test.js
git commit -m "feat(util): add ping health card with latency sparkline"
```

---

### Task 5: `/ping` command + bot.js sampler wiring

**Files:**
- Modify: `src/modules/util/commands/ping.js` (replace the text version)
- Modify: `src/bot.js` (add `pingHistory` to context + a sampler)
- Test: `test/modules/util/ping.test.js` (rewrite)

**Interfaces:**
- Consumes: `buildPingCard` (`pingCard.js`), `ctx.pingHistory` (`PingHistory`).

- [ ] **Step 1: Rewrite the failing test**

Replace the entire contents of `test/modules/util/ping.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { PingHistory } from "../../../src/lib/PingHistory.js";
import ping from "../../../src/modules/util/commands/ping.js";

describe("ping command", () => {
  it("has a name and no required permissions", () => {
    expect(ping.data.name).toBe("ping");
    expect(ping.permissions).toEqual([]);
  });

  it("samples the current ping and replies with a PNG attachment", async () => {
    const history = new PingHistory();
    const interaction = {
      client: { ws: { ping: 42 }, uptime: 3_600_000 },
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
    };
    await ping.execute(interaction, { pingHistory: history });
    expect(history.samples()).toContain(42); // current ping recorded
    expect(interaction.deferReply).toHaveBeenCalled();
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.files).toHaveLength(1);
    const buf = payload.files[0].attachment;
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/modules/util/ping.test.js`
Expected: FAIL — current `ping.js` replies with an embed, not a PNG attachment.

- [ ] **Step 3: Rewrite `src/modules/util/commands/ping.js`**

```js
import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { buildPingCard } from "../pingCard.js";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency and health."),
  permissions: [],
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const currentPing = Math.round(interaction.client.ws.ping);
    ctx.pingHistory?.push(currentPing);
    const png = await buildPingCard({
      samples: ctx.pingHistory?.samples() ?? [],
      currentPing,
      uptimeMs: interaction.client.uptime ?? 0,
    });
    const file = new AttachmentBuilder(png, { name: "ping.png" });
    await interaction.editReply({ files: [file] });
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/modules/util/ping.test.js`
Expected: PASS.

- [ ] **Step 5: Wire `pingHistory` + sampler into `src/bot.js`**

Add the import near the other `src/lib` / core imports:
```js
import { PingHistory } from "./lib/PingHistory.js";
```
Add to the `context` object (alongside `cooldowns: new Cooldowns(),`):
```js
    pingHistory: new PingHistory(),
```
After `await client.login(env.token);` and before `return { client, context };`, add the sampler:
```js
  const pingSampler = setInterval(() => context.pingHistory.push(client.ws.ping), 10_000);
  pingSampler.unref?.();
```

- [ ] **Step 6: Verify bot wiring imports resolve**

Run: `npx vitest run test/smoke.test.js test/modules/util/ping.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/util/commands/ping.js src/bot.js test/modules/util/ping.test.js
git commit -m "feat(util): /ping renders a health card + wire ping sampler"
```

---

### Task 6: `/welcome` panel — render (pure)

**Files:**
- Create: `src/modules/welcome/panel/render.js`
- Test: `test/modules/welcome/panelRender.test.js`

**Interfaces:**
- Produces: `buildWelcomeView(state) -> { embeds, components }`.
- `state` shape: `{ guildId, ownerId, welcome: { welcomeEnabled, welcomeChannelId, welcomeMessage, goodbyeEnabled, goodbyeChannelId, goodbyeMessage } }`.
- Custom-ids (consumed by Task 7): `we:tog:welcomeEnabled:<o>`, `we:tog:goodbyeEnabled:<o>`, `we:msg:welcome:<o>`, `we:msg:goodbye:<o>`, `we:preview:<o>`, `we:ch:welcome:<o>` (channel select), `we:ch:goodbye:<o>` (channel select), `we:close:<o>`.

- [ ] **Step 1: Write the failing test**

Create `test/modules/welcome/panelRender.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildWelcomeView } from "../../../src/modules/welcome/panel/render.js";

const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  welcome: {
    welcomeEnabled: true, welcomeChannelId: "c1", welcomeMessage: "hi {mention}",
    goodbyeEnabled: false, goodbyeChannelId: null, goodbyeMessage: "bye {user}",
  },
  ...over,
});

describe("buildWelcomeView", () => {
  it("exposes toggle/message/channel/preview/close controls", () => {
    const ids = buildWelcomeView(state()).components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("we:tog:welcomeEnabled:o1");
    expect(ids).toContain("we:tog:goodbyeEnabled:o1");
    expect(ids).toContain("we:msg:welcome:o1");
    expect(ids).toContain("we:msg:goodbye:o1");
    expect(ids).toContain("we:preview:o1");
    expect(ids).toContain("we:ch:welcome:o1");
    expect(ids).toContain("we:ch:goodbye:o1");
    expect(ids).toContain("we:close:o1");
  });
  it("shows the welcome toggle green (Success=3) when enabled", () => {
    expect(buildWelcomeView(state()).components[0].components[0].data.style).toBe(3);
  });
  it("has at most 5 rows", () => {
    expect(buildWelcomeView(state()).components.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/modules/welcome/panelRender.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/modules/welcome/panel/render.js`**

```js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";

const PLACEHOLDERS = "`{mention}` `{user}` `{username}` `{server}` `{memberCount}`";

export function buildWelcomeView(state) {
  const w = state.welcome;
  const o = state.ownerId;

  const embed = new EmbedBuilder()
    .setColor(w.welcomeEnabled || w.goodbyeEnabled ? COLORS.success : COLORS.warn)
    .setTitle("👋 Welcome & Goodbye Panel")
    .setDescription(
      `**Welcome:** ${w.welcomeEnabled ? `🟢 → ${w.welcomeChannelId ? `<#${w.welcomeChannelId}>` : "*no channel*"}` : "🔴 off"}\n` +
        (w.welcomeMessage ? `> ${w.welcomeMessage}\n` : "") +
        `**Goodbye:** ${w.goodbyeEnabled ? `🟢 → ${w.goodbyeChannelId ? `<#${w.goodbyeChannelId}>` : "*no channel*"}` : "🔴 off"}\n` +
        (w.goodbyeMessage ? `> ${w.goodbyeMessage}\n` : "") +
        `\nPlaceholders: ${PLACEHOLDERS}`,
    );

  const tog = (field, label) =>
    new ButtonBuilder()
      .setCustomId(`we:tog:${field}:${o}`)
      .setLabel(`${w[field] ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(w[field] ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    tog("welcomeEnabled", "Welcome"),
    tog("goodbyeEnabled", "Goodbye"),
    new ButtonBuilder().setCustomId(`we:msg:welcome:${o}`).setLabel("Welcome msg…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`we:msg:goodbye:${o}`).setLabel("Goodbye msg…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`we:preview:${o}`).setLabel("Preview").setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`we:ch:welcome:${o}`)
      .setPlaceholder("Welcome channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`we:ch:goodbye:${o}`)
      .setPlaceholder("Goodbye channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`we:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/modules/welcome/panelRender.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/welcome/panel/render.js test/modules/welcome/panelRender.test.js
git commit -m "feat(welcome): add welcome panel render view"
```

---

### Task 7: `/welcome` panel — handlers, index, command

**Files:**
- Create: `src/modules/welcome/panel/handlers.js`
- Create: `src/modules/welcome/panel/index.js`
- Modify: `src/modules/welcome/commands/welcome.js` (replace subcommands with the panel)
- Modify: `test/modules/welcome/welcomeCommand.test.js` (rewrite for the panel command)
- Test: `test/modules/welcome/panelHandlers.test.js`

**Interfaces:**
- Consumes: `ConfigService.updateWelcome`; `runPanel`; `renderTemplate` (`src/modules/welcome/render.js`); render view from Task 6.
- Produces: `handleWelcomeComponent(i, state, ctx, render) -> "update"|"handled"|"close"`; `runWelcomePanel(interaction, ctx) -> Promise<void>`.

- [ ] **Step 1: Write the failing handlers test**

Create `test/modules/welcome/panelHandlers.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { handleWelcomeComponent } from "../../../src/modules/welcome/panel/handlers.js";

const ctx = () => ({ config: { updateWelcome: vi.fn(async () => ({})) } });
const baseState = () => ({
  guildId: "g1",
  ownerId: "o1",
  welcome: {
    welcomeEnabled: false, welcomeChannelId: null, welcomeMessage: "hi",
    goodbyeEnabled: false, goodbyeChannelId: null, goodbyeMessage: "bye",
  },
});
const render = () => ({ embeds: [], components: [] });

describe("handleWelcomeComponent", () => {
  it("toggles welcomeEnabled and persists", async () => {
    const c = ctx();
    const s = baseState();
    const dir = await handleWelcomeComponent({ customId: "we:tog:welcomeEnabled:o1", user: { id: "o1" } }, s, c, render);
    expect(dir).toBe("update");
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", { welcomeEnabled: true });
    expect(s.welcome.welcomeEnabled).toBe(true);
  });

  it("setting the welcome channel also enables welcomes", async () => {
    const c = ctx();
    const s = baseState();
    await handleWelcomeComponent({ customId: "we:ch:welcome:o1", values: ["c9"], user: { id: "o1" } }, s, c, render);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", { welcomeChannelId: "c9", welcomeEnabled: true });
    expect(s.welcome.welcomeChannelId).toBe("c9");
    expect(s.welcome.welcomeEnabled).toBe(true);
  });

  it("previews both templates ephemerally without persisting", async () => {
    const c = ctx();
    const s = baseState();
    const reply = vi.fn(async () => {});
    const i = {
      customId: "we:preview:o1",
      user: { id: "o1" },
      member: { id: "o1", user: { tag: "me#1", username: "me" } },
      guild: { name: "Guild", memberCount: 5 },
      reply,
    };
    const dir = await handleWelcomeComponent(i, s, c, render);
    expect(dir).toBe("handled");
    expect(reply).toHaveBeenCalled();
    expect(c.config.updateWelcome).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0].ephemeral).toBe(true);
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleWelcomeComponent({ customId: "we:close:o1", user: { id: "o1" } }, baseState(), ctx(), render);
    expect(dir).toBe("close");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/modules/welcome/panelHandlers.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/modules/welcome/panel/handlers.js`**

```js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { infoEmbed } from "../../../lib/embeds.js";
import { renderTemplate } from "../render.js";

async function openMessageModal(i, state, ctx, render, which) {
  const field = which === "welcome" ? "welcomeMessage" : "goodbyeMessage";
  const modalId = `we:msgmodal:${which}:${i.user.id}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(`${which === "welcome" ? "Welcome" : "Goodbye"} message`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("text")
        .setLabel("Template — supports placeholders")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(String(state.welcome[field] ?? ""))
        .setRequired(true)
        .setMaxLength(1000),
    ),
  );
  await i.showModal(modal);

  let sub;
  try {
    sub = await i.awaitModalSubmit({ time: 120000, filter: (m) => m.customId === modalId && m.user.id === i.user.id });
  } catch {
    return "handled";
  }

  const text = sub.fields.getTextInputValue("text");
  await ctx.config.updateWelcome(state.guildId, { [field]: text });
  state.welcome[field] = text;
  await sub.update(render());
  return "handled";
}

export async function handleWelcomeComponent(i, state, ctx, render) {
  const parts = i.customId.split(":"); // we:<kind>:<arg>:<owner>
  const kind = parts[1];
  const arg = parts[2];

  if (kind === "close") return "close";

  if (kind === "tog") {
    const next = !state.welcome[arg];
    await ctx.config.updateWelcome(state.guildId, { [arg]: next });
    state.welcome[arg] = next;
    return "update";
  }

  if (kind === "ch") {
    const channelId = i.values[0];
    const chField = arg === "welcome" ? "welcomeChannelId" : "goodbyeChannelId";
    const enField = arg === "welcome" ? "welcomeEnabled" : "goodbyeEnabled";
    await ctx.config.updateWelcome(state.guildId, { [chField]: channelId, [enField]: true });
    state.welcome[chField] = channelId;
    state.welcome[enField] = true;
    return "update";
  }

  if (kind === "msg") {
    return openMessageModal(i, state, ctx, render, arg);
  }

  if (kind === "preview") {
    const opts = { member: i.member, guild: i.guild };
    const welcome = renderTemplate(state.welcome.welcomeMessage, opts);
    const goodbye = renderTemplate(state.welcome.goodbyeMessage, opts);
    await i.reply({
      embeds: [infoEmbed("👋 Preview", `**Welcome:**\n${welcome}\n\n**Goodbye:**\n${goodbye}`)],
      ephemeral: true,
    });
    return "handled";
  }

  return "update";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/modules/welcome/panelHandlers.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `src/modules/welcome/panel/index.js`**

```js
import { runPanel } from "../../../lib/panel.js";
import { buildWelcomeView } from "./render.js";
import { handleWelcomeComponent } from "./handlers.js";

const DEFAULTS = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage: "Welcome {mention} to **{server}**! You are member #{memberCount}.",
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: "**{user}** has left the server.",
};

export async function runWelcomePanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    welcome: { ...DEFAULTS, ...(gc.welcome ?? {}) },
  };
  const render = () => buildWelcomeView(state);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleWelcomeComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
```

- [ ] **Step 6: Replace `src/modules/welcome/commands/welcome.js`**

Replace the entire file with:
```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runWelcomePanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Open the welcome & goodbye control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runWelcomePanel(interaction, ctx),
};
```

- [ ] **Step 7: Rewrite `test/modules/welcome/welcomeCommand.test.js`**

Replace the entire file with:
```js
import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import welcome from "../../../src/modules/welcome/commands/welcome.js";

describe("welcome command", () => {
  it("is an Administrator-gated bare command (panel entry, no subcommands)", () => {
    expect(welcome.data.name).toBe("welcome");
    expect(welcome.permissions).toEqual([PermissionFlagsBits.Administrator]);
    const json = welcome.data.toJSON();
    expect(json.options ?? []).toHaveLength(0); // no subcommands
  });
});
```

- [ ] **Step 8: Run the welcome suite + command JSON check**

Run:
```bash
npx vitest run test/modules/welcome
node --input-type=module -e "import c from './src/modules/welcome/commands/welcome.js'; console.log(JSON.stringify(c.data.toJSON()).slice(0,90));"
```
Expected: welcome tests PASS; JSON payload contains `"name":"welcome"` with no `options`.

- [ ] **Step 9: Commit**

```bash
git add src/modules/welcome/panel/handlers.js src/modules/welcome/panel/index.js src/modules/welcome/commands/welcome.js test/modules/welcome/panelHandlers.test.js test/modules/welcome/welcomeCommand.test.js
git commit -m "feat(welcome): replace subcommands with an interactive control panel"
```

---

### Task 8: Docs (tutorial + README) + full-suite gate

**Files:**
- Modify: `src/modules/util/tutorial.js` (welcome + new-commands copy)
- Modify: `README.md` (welcome section + `/ping` / `/avatar`)

**Interfaces:** documentation + final verification.

- [ ] **Step 1: Update the Welcome tutorial chapter**

In `src/modules/util/tutorial.js`, find the `Welcome & Roles` chapter body and replace its first bullet (the `/welcome set-channel` line) with:
```
      "• `/welcome` opens a **control panel** — toggle welcome/goodbye, pick channels, edit messages, and **preview** them. Placeholders: `{mention} {user} {username} {server} {memberCount}`.\n" +
```
(Leave the `/autorole` and `/reactionrole` bullets unchanged.)

- [ ] **Step 2: Update the `Tips & Support` or `Getting Started` chapter to mention the new util commands**

In the `Getting Started` chapter body, append this line before the final "Use the ◀️ ▶️ buttons" line:
```
      "• `/ping` shows a bot-health card, `/avatar` shows a user's avatar, `/serverinfo` & `/userinfo` show details.\n" +
```

- [ ] **Step 3: Update `README.md`**

Replace the `## Welcome & Onboarding` section's `/welcome` bullet (around line 97) with:
```markdown
- `/welcome` (Administrator) — opens a control panel to toggle welcome/goodbye messages, pick their
  channels, edit the templates, and preview them. Placeholders: `{mention} {user} {username} {server} {memberCount}`.
```
And add a short line under the utility/commands area (or create a `## Utility` section if none exists):
```markdown
## Utility

`/ping` renders a bot-health card with a gateway-latency sparkline and uptime. `/avatar [user]` shows a
user's avatar with download links. `/serverinfo` and `/userinfo` show server/user details.
```

- [ ] **Step 4: Run the tutorial tests**

Run: `npx vitest run test/modules/util/tutorial.test.js`
Expected: PASS (chapter count unchanged; edits are within existing chapters).

- [ ] **Step 5: FINAL GATE — full suite + lint**

Run:
```bash
npx vitest run
npx eslint src/lib src/modules/util src/modules/welcome src/bot.js
```
Expected: all tests PASS; ESLint clean.

- [ ] **Step 6: Commit**

```bash
git add src/modules/util/tutorial.js README.md
git commit -m "docs: /ping card, /avatar, and /welcome panel"
```

---

## Post-plan: register commands

After merge, run `npm run register` (adds `/avatar`; replaces the old `/welcome` subcommands with the bare panel command; `/ping` keeps its name). Restart the bot so the new `/ping` card, the ping sampler, and the `/welcome` panel are live.
