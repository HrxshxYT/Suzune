# UI Overhaul + Interactive Buttons + Audit Log — Design Spec

**Date:** 2026-07-10
**Status:** Approved

## Goal

Make Joint Jagadeesan visually cohesive and interactive: a green-forward embed theme,
interactive buttons/menus across key commands, a guided `/tutorial`, and a new `/auditlog`
consolidated event feed that reliably reports every server & member change to one channel.

## Decisions (locked with user)

- **Theme:** green-forward. Info/neutral/success are green; **error stays red, warn stays amber**
  so problems remain visually distinct.
- **Audit vs logging:** `/auditlog` is a NEW consolidated feed (one master channel, all event
  types, per-category toggles). The existing granular `/logging` (per-category channels) stays.
- **Member profile tracking:** guild-level only (nickname, roles, server avatar, timeout, boosts).
  No global username/avatar tracking — Discord delivers those events unreliably.
- **Buttons:** help navigation, confirm-destructive actions, paginated lists, config toggle panels.
- **Components model:** per-message collectors (owner-gated, timeout-expiring). No persistent
  registry. Buttons stop responding after a bot restart; user re-runs the command.
- **Plus:** a `/tutorial` interactive walkthrough command.

## Global constraints

- Node.js 25 ESM, discord.js v14, PostgreSQL + Prisma, Vitest, ESLint 9 flat config.
- Bot name `Joint Jagadeesan` (`BOT_NAME`). Slash-commands only. TDD, one deliverable per task.
- No live-DB dependency for pure logic; migrations applied against the local Postgres already
  provisioned (`postgresql://hrishi@localhost:5432/discordbot`).
- Pure builders/decision logic separated from Discord side-effects (injected deps), matching the
  established modular pattern.

---

## Stage 1 — Green theme + component foundation

### Palette (`src/lib/constants.js`)
```
COLORS = {
  brand:   0x2ECC71,  // primary green (config panels, info, neutral)
  success: 0x57F287,  // green
  info:    0x2ECC71,  // was blurple → green
  muted:   0x1F8B4C,  // dark green accent (footers, secondary)
  warn:    0xFEE75C,  // amber (kept)
  error:   0xED4245,  // red (kept)
}
EMOJIS = { success:"✅", error:"❌", warn:"⚠️", info:"ℹ️", gear:"⚙️", shield:"🛡️",
           mod:"🔨", log:"📋", invite:"📨", wave:"👋", star:"⭐", book:"📖",
           on:"🟢", off:"🔴", next:"▶️", prev:"◀️" }
```

### Embed helpers (`src/lib/embeds.js`)
Keep existing signatures `successEmbed(text)`, `errorEmbed(text)`, `warnEmbed(text)`,
`infoEmbed(title,text)` (used across the codebase) — restyle: green base where semantic,
consistent `Joint Jagadeesan` footer + timestamp. Add:
- `brandEmbed({ title, description, fields, thumbnail })` — green branded embed for panels.
- `panelEmbed(...)` alias used by config panels and `/tutorial`.
All new embeds set footer text `Joint Jagadeesan` and a timestamp.

### Component primitives (`src/lib/components.js`) — pure, unit-tested
- `paginate(items, pageSize) -> items[][]` — chunk a list into pages.
- `pageRow({ page, pageCount, ownerId }) -> ActionRowBuilder` — `◀️ Prev` / `page x/y` (disabled
  label button) / `Next ▶️`; prev disabled on first page, next disabled on last. customId encodes
  `page:prev|next:<ownerId>`.
- `confirmRow(ownerId) -> ActionRowBuilder` — `Confirm` (Danger) / `Cancel` (Secondary), customIds
  `confirm:yes:<ownerId>` / `confirm:no:<ownerId>`.
- `toggleRow(items) -> ActionRowBuilder[]` — buttons for `{ key, label, on }[]`, green when on /
  grey when off, customId `toggle:<key>:<ownerId>`; chunked ≤5 per row, ≤5 rows.
- `ownerFilter(interaction, ownerId) -> bool` — true only if the clicker is the owner.

### Collector wrapper (`src/lib/collect.js`)
- `awaitButton({ message, ownerId, timeMs=120000 }) -> interaction|null` — resolves the first
  owner button click or null on timeout.
- `disableAll(components) -> rows` — returns the same rows with every button disabled (for
  post-timeout cleanup).

### Router change (`src/modules/util/events/interactionCreate.js`)
Ignore `interaction.isButton()` / `isStringSelectMenu()` at the top-level router (they are handled
by per-message collectors inside each command, not globally) — i.e. `return` early for component
interactions that are not being awaited, so unknown/expired buttons don't fall through to command
lookup. (No global component dispatch; collectors own their messages.)

---

## Stage 2 — Buttons on commands + `/tutorial`

### `/help` (`src/modules/util/commands/help.js`)
- Replace the static list with an interactive view: a **StringSelectMenu** of the ~8 categories
  (antinuke, moderation, logging, invites, automod, welcome, audit, util) + `◀️/▶️` pagination
  within the selected category. Green embeds. Owner-gated, 3-min collector; buttons disable on
  timeout. `/help <command>` detail view unchanged in behavior, restyled.

### `/tutorial` (`src/modules/util/commands/tutorial.js`) — NEW
- An interactive, multi-page walkthrough teaching how the bot works and how to set it up.
- Navigation: a **StringSelectMenu** of chapters + `◀️ Prev / ▶️ Next` buttons. Owner-gated.
- Chapters (green `panelEmbed`s, each with a short "what it is" + "commands to run" + example):
  1. **Getting Started** — invite/permissions/role position, what `/config` does.
  2. **Moderation** — cases, ban/kick/timeout/warn/purge, mod roles, confirmations.
  3. **Anti-Nuke** — thresholds, whitelist, panic mode, `/antinuke`.
  4. **Auto-Moderation** — filters + actions, exemptions, `/automod`.
  5. **Logging & Audit Log** — granular `/logging` vs consolidated `/auditlog`.
  6. **Welcome & Roles** — `/welcome`, `/autorole`, `/reactionrole`, placeholders.
  7. **Invite Tracking** — `/invites`.
  8. **Tips** — `/help`, permission model, support.
- Chapter content is pure data (`TUTORIAL_CHAPTERS`) rendered by a pure `renderChapter(i)` →
  embed, so it is unit-testable without Discord.

### Confirm destructive (`src/modules/moderation/...`)
- `ban`, `kick`, `unban`, `softban`, `tempban`, `purge` first reply with a summary embed + a
  `confirmRow`. On `Confirm` → execute and edit the message to the result; on `Cancel`/timeout →
  edit to "Cancelled". Owner-gated, 30s. A shared helper `withConfirm(interaction, { embed, onConfirm })`
  in `src/modules/moderation/confirm.js` wraps the pattern.

### Paginated lists
- `/invites leaderboard`, moderation case history (`/case list` or equivalent), `/auditlog view`
  render page 1 with a `pageRow`; collector re-renders on prev/next using `paginate`.

### Config toggle panels
- `/automod`, `/antinuke`, `/logging`, `/auditlog` gain a `panel` (or restyled `view`) that shows
  current settings as `toggleRow` buttons. Clicking a toggle calls the matching
  `ctx.config.update*` and re-renders the panel. Owner-gated, 3-min collector.

---

## Stage 3 — `/auditlog` consolidated feed

### Data model (`prisma/schema.prisma`)
```prisma
model AuditConfig {
  guildId   String  @id
  guild     Guild   @relation(fields:[guildId], references:[id], onDelete: Cascade)
  enabled   Boolean @default(false)
  channelId String?
  events    Json    @default("{}")  // { categoryKey: bool }; missing key = enabled
}
```
Add `audit AuditConfig?` to `Guild`; include `audit: true` in `ConfigService` INCLUDE; add
`ConfigService.updateAudit(guildId, data)` (upsert + invalidate) and clear in `resetGuildConfig`.

### Module (`src/modules/audit/`) — self-contained, own listeners
- `categories.js` — the list of audit category keys + labels.
- `dispatch.js` — `postAudit(ctx, guild, category, embed)`: reads `AuditConfig`; if
  `enabled && channelId && events[category] !== false`, resolves the channel and sends the embed.
  Pure `shouldPost(config, category) -> bool` for unit tests.
- `attribution.js` — `fetchActor(guild, auditType, targetId) -> { user, reason }|null`, reusing the
  anti-nuke audit-log fetch pattern (best-effort; needs View Audit Log).
- `format.js` — pure embed builders per event (green, actor + target + before/after + timestamp +
  thumbnail). Unit-tested with mock payloads.
- `events/` listeners → each builds an embed via `format.js`, attributes via `attribution.js`,
  calls `postAudit`:
  - `guildMemberAdd`, `guildMemberRemove` (join/leave)
  - `guildBanAdd`, `guildBanRemove`
  - `guildMemberUpdate` (nickname, roles ±, timeout set/clear, server-avatar, boost start/stop)
  - `messageUpdate`, `messageDelete`, `messageDeleteBulk`
  - `channelCreate`, `channelDelete`, `channelUpdate`
  - `roleCreate`, `roleDelete`, `roleUpdate`
  - `guildUpdate` (name/icon/settings), `emojiCreate/Delete/Update`, `stickerCreate/Delete/Update`
  - `threadCreate`, `threadDelete`
  - `voiceStateUpdate` (join/leave/move)
  - `inviteCreate`, `inviteDelete`
- Category keys map events → toggles: `members, memberEdits, bans, messages, channels, roles,
  server, emojis, threads, voice, invites, boosts`.

### `/auditlog` command (`src/modules/audit/commands/auditlog.js`) — Administrator
- `channel <#channel>` — set channel + enable.
- `disable` — turn off.
- `events` — open a `toggleRow` panel to flip category on/off (Stage 2 pattern).
- `view` — show current config (channel, enabled, per-category state) as a green panel.

### Intents
All required intents are already enabled: `Guilds, GuildMembers, GuildModeration, GuildMessages,
MessageContent, GuildVoiceStates, GuildInvites, GuildEmojisAndStickers`. No portal changes.

---

## Build order & decomposition

Three implementation plans, each its own branch, merged to `main` in order (matches prior phases):

1. **Plan A — Theme + component foundation** (Stage 1). No behavior change to commands yet;
   restyle embeds + add pure primitives + collector wrapper + router guard.
2. **Plan B — Buttons + `/tutorial`** (Stage 2). Applies primitives to help, confirms, lists,
   config panels; adds `/tutorial`.
3. **Plan C — `/auditlog`** (Stage 3). Schema, config, listeners, dispatch, command.

## Testing

- Pure builders (`paginate`, `pageRow`, `confirmRow`, `toggleRow`, `ownerFilter`, `renderChapter`,
  `shouldPost`, `format.js`) → Vitest unit tests, no Discord.
- Commands → tested with mock interactions (existing pattern), asserting they reply with the right
  rows/embeds and call the right config methods; collector wiring kept thin.
- Full suite + ESLint + loader probe + a live `npm start` boot check per plan.

## Out of scope (future)

- Persistent (restart-surviving) component state / global component registry.
- Global (non-guild) username & avatar tracking.
- Modal-based inputs; localization; music (still deferred).
