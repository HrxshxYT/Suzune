# Phase 2e — `/ping` sparkline, `/avatar`, `/welcome` panel

**Date:** 2026-07-13

## Goal

Three independent additions to the bot:

1. **`/ping`** renders an image "health" card with a **latency sparkline** (recent
   gateway latency over time), the current WebSocket latency, and uptime.
2. **`/avatar [user]`** shows a user's avatar large, with download links and the
   server-specific avatar if present.
3. **`/welcome`** becomes an interactive control panel (replacing its
   subcommands), matching the antinuke/automod/audit/levels panels.

These reuse existing infrastructure (`@napi-rs/canvas`, `runPanel`, `ConfigService`).

## Shared card font (DRY)

`/ping` needs `@napi-rs/canvas` text rendering, which requires a registered font.
Leveling already bundles `DejaVuSans.ttf`. To avoid duplicating the ~750KB binary:

- Move the font to **`src/assets/DejaVuSans.ttf`** (single copy).
- Add **`src/lib/cardFont.js`**: `ensureCardFont()` registers that font once
  (idempotent) as family `"BotSans"` via `GlobalFonts.registerFromPath`, wrapped
  in try/catch so a missing file never throws at import.
- Update `src/modules/leveling/card.js` to call `ensureCardFont()` and use
  `"BotSans"` instead of its local registration. Behavior unchanged; its existing
  PNG-signature smoke test still passes.

## 1. `/ping` — latency sparkline card

### Ping history (new runtime piece)
- **`src/lib/PingHistory.js`** — `class PingHistory { constructor(cap = 30) }` with
  `push(ping)` (ignores `ping < 0`, keeps at most `cap` samples) and
  `samples() -> number[]` (oldest→newest copy). Pure, unit-tested.
- **`src/bot.js`** — add `pingHistory: new PingHistory()` to the DI context and start
  a `setInterval(() => context.pingHistory.push(client.ws.ping), 10_000)` sampler
  after login (unref'd so it never holds the process open).

### Card
- **`src/modules/util/pingCard.js`**:
  - Pure `formatUptime(ms) -> string` (e.g. `"3d 4h 12m"`), unit-tested.
  - Pure `sparklinePoints(samples, { width, height, min, max }) -> [{x,y}]` mapping
    samples to canvas coordinates, unit-tested (handles 0/1 sample, flat series).
  - `buildPingCard({ samples, currentPing, uptimeMs }) -> Promise<Buffer>` (PNG) —
    draws the sparkline, the current latency as a large number colored by threshold
    (green ≤150ms, amber ≤300ms, red otherwise), and uptime. With <2 samples, draws
    a "collecting data…" state instead of a line. Smoke-tested for a non-empty PNG.

### Command
- **`src/modules/util/commands/ping.js`** (replaces the current text version):
  defers, reads `interaction.client.ws.ping` and `interaction.client.uptime`, pushes
  the current ping into `ctx.pingHistory`, renders the card, replies with an
  `AttachmentBuilder`. `permissions: []`.

## 2. `/avatar [user]`

- **`src/modules/util/commands/avatar.js`**: optional `user` option (defaults to
  caller). `await user.fetch()` for a full profile. Pure helper
  `avatarLinks(user) -> string` builds `[PNG](…) · [JPG](…) · [WebP](…)` (plus `GIF`
  when the avatar is animated), unit-tested. Brand embed with
  `.setImage(user.displayAvatarURL({ size: 512 }))` and the links. If the member has
  a guild avatar (`member.avatar`), add a field linking it. `permissions: []`.

## 3. `/welcome` — interactive panel (replaces subcommands)

Uses `runPanel` (`src/lib/panel.js`), owner-gated, ≤5 rows, ephemeral. Mirrors the
antinuke panel's structure (`panel/render.js`, `panel/handlers.js`, `panel/index.js`).

### Views
- **Main view** (`buildWelcomeView(state)`):
  - Row 1 (buttons): `we:tog:welcomeEnabled` · `we:tog:goodbyeEnabled` ·
    `we:msg:welcome` (modal) · `we:msg:goodbye` (modal) · `we:preview`
  - Row 2: welcome channel select `we:ch:welcome`
  - Row 3: goodbye channel select `we:ch:goodbye`
  - Row 4: `we:close`
  - Embed summarizes current state (enabled flags, channels, message previews) and
    lists the placeholders.
- Custom-ids carry the `:<ownerId>` suffix like the other panels.

### Handlers (`handleWelcomeComponent(i, state, ctx, render)`)
- `tog`: flip `welcomeEnabled`/`goodbyeEnabled`, persist via `updateWelcome`, mutate state.
- `ch`: set `welcomeChannelId`/`goodbyeChannelId` from the channel select; setting a
  welcome/goodbye channel also enables that side (matches the old `set-channel`
  behavior). Persist + mutate.
- `msg`: open a modal (multiline text input) prefilled with the current template;
  on submit persist `welcomeMessage`/`goodbyeMessage`, `sub.update(render())`, return `"handled"`.
- `preview`: render both templates with `renderTemplate(template, { member: i.member,
  guild: i.guild })` (reused from `src/modules/welcome/render.js`) — i.e. previewed as
  if the invoking admin just joined/left — and reply ephemerally; return `"handled"`.
- `close`: return `"close"`.

### Command + wiring
- **`src/modules/welcome/commands/welcome.js`** replaced with a bare
  Administrator-gated command delegating to `runWelcomePanel` (mirror
  `automod.js`). The `guildMemberAdd`/`guildMemberRemove` event listeners are
  unchanged.
- Placeholder text reused; `renderTemplate` reused from the welcome module for preview.

## Testing

- **Shared:** `cardFont.ensureCardFont` idempotent (registers once); no throw when
  the font is missing.
- **PingHistory:** push caps at `cap`, ignores negatives, `samples()` order.
- **pingCard:** `formatUptime` cases; `sparklinePoints` (empty/one/flat/normal);
  `buildPingCard` returns a non-empty PNG (smoke).
- **avatar:** `avatarLinks` (static vs animated); command builds an embed with the
  avatar image; defaults to caller.
- **welcome panel:** render test (custom-ids present, toggle colors); handler tests
  (toggle persists, channel select persists + enables, close returns `"close"`),
  mirroring the antinuke panel tests.
- Full suite + ESLint gate at the end.

## Out of scope (YAGNI)

- Round-trip/API latency on `/ping` (gateway WS latency + uptime only).
- Canvas rank-style decoration for `/avatar` (native avatars suffice).
- Per-guild welcome images/banners, DM welcomes, welcome-message embeds.
- Upgrading the leveling level-up message to an embed (separate, optional).

## Post-merge

Run `npm run register` (the `/welcome` subcommands are removed → the bare command
replaces them) and restart the bot (new `/ping`, `/avatar`, and the ping sampler).
