# Leveling / XP — design (Phase 2, feature 1 of 4)

**Date:** 2026-07-12

## Goal

A message-based leveling system: members earn XP for chatting, level up with a
current-channel announcement, and can earn role rewards. Surfaced via an image
`/rank` card, a paginated `/leaderboard`, and an interactive `/levels`
configuration panel.

This is the first of four Phase 2 subsystems (see [[phase2-scope]] — tickets,
leveling, starboard, giveaways), each built as its own spec → plan → build cycle.

## Decisions (locked with the user)

- **Rank display:** generated **image card** (`@napi-rs/canvas`), not an embed.
- **Level-up notifications:** posted in the **current channel** (where the
  triggering message was sent); suppressed when `announce` is off.
- **Role rewards:** **highest-only** — grant the highest earned tier and remove
  lower reward roles.
- **Config UX:** an **interactive `/levels` panel** (buttons + selects), matching
  the antinuke/automod/audit panels.

## Data model (Prisma)

Follow the existing convention: dedicated per-guild config model; lists stored as
`Json @default("[]")` (the repo does not use Postgres scalar lists).

- **`MemberLevel`** — `guildId`, `userId`, `xp Int @default(0)`; composite PK
  `@@id([guildId, userId])`. Level is **derived** from `xp` (never stored). The
  leaderboard sorts by `xp` descending.
- **`LevelReward`** — `guildId`, `level Int`, `roleId String`; unique
  `@@unique([guildId, level])`.
- **`LevelingConfig`** — `guildId @id`, `enabled Boolean @default(false)`,
  `xpMin Int @default(15)`, `xpMax Int @default(25)`,
  `cooldownSec Int @default(60)`, `announce Boolean @default(true)`,
  `ignoredChannels Json @default("[]")`, `ignoredRoles Json @default("[]")`.

Migrations generated offline with
`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
(no live DB required for logic work), then `npx prisma generate`.

## Level curve (pure, unit-tested)

MEE6-style per-level cost `5·L² + 50·L + 100`.

- `xpForLevel(level)` — cumulative total XP to *reach* `level`.
- `levelForXp(xp)` — highest level whose threshold ≤ `xp`.
- `progress(xp)` — `{ level, xpIntoLevel, xpForNext, percent }` for the bar.

## XP accrual — `messageCreate` listener

Under `src/modules/leveling/`, auto-discovered. **No new intent** —
`GuildMessages` (already enabled) delivers message events; we count events, not
content, so `MessageContent` is not required.

Pure `shouldAward({ message, config, member })` returns false for: bots, DMs,
leveling disabled, ignored channel, or member holding an ignored role.

Cooldown reuses the existing **`ctx.cooldowns`**:
`cooldowns.check("xp:" + guildId, userId, config.cooldownSec)` — no new cooldown
infrastructure. On a non-limited award, grant a random integer in
`[xpMin, xpMax]`.

`applyXp` (injected DB write) increments `xp`; the pure `detectLevelUp(oldXp,
newXp)` compares `levelForXp` before/after. On an increase:

1. If `announce`, post a level-up message in `message.channel`.
2. `resolveRewards(newLevel, rewards)` → `{ add, remove }` (highest-only); apply
   via injected `member.roles.add/remove`, each guarded (never throw out of the
   listener).

## Role rewards (pure)

`resolveRewards(level, rewards)`:
- `add` = the reward role for the highest `rewards[].level ≤ level`, if any and
  not already held.
- `remove` = every other reward role the member currently holds.

## `/rank [user]` — image card

- **Pure (tested):** `buildRankData({ memberXp, rankPosition })` →
  `{ level, rank, xpIntoLevel, xpForNext, percent }`. `rank` = count of guild
  members with more XP + 1 (via a `LevelingService.rankOf` query).
- **Render (isolated):** `buildRankCard(data, { avatarPng })` uses
  `@napi-rs/canvas` to draw avatar, progress bar, level, and rank into a PNG
  `Buffer`, replied as an attachment. A permissively-licensed `.ttf` is bundled
  under `src/modules/leveling/assets/` and registered via `GlobalFonts` (host
  system fonts are not guaranteed). Covered by a smoke test asserting a non-empty
  PNG buffer, not pixel output.
- `permissions: []`; defaults to the caller when no `user` is given.

## `/leaderboard`

Top members by XP, **paginated with the existing `runPager`** (`src/lib/navigator.js`),
styled like the current invite leaderboard embed. `permissions: []`.

## `/levels` — interactive panel (Administrator)

Uses `runPanel` (`src/lib/panel.js`), owner-gated, ≤5 action rows per view.

- **Main view:**
  - Row 1: toggle **Enabled** · toggle **Announce** · **XP settings…** (modal:
    min / max / cooldown) · **Rewards…** · **Close**
  - Row 2: **ignored channels** — channel multi-select
  - Row 3: **ignored roles** — role multi-select
- **Rewards sub-view** (two-step in-panel flow, mirroring how the antinuke panel
  picks an action then sets its value):
  - Row 1: **role select** → stores `state.pendingRoleId`.
  - Row 2: **level select** — a string select of milestone presets
    (1, 3, 5, 10, 15, 20, 25, 30, 40, 50). Picking a level while a role is pending
    persists the reward `{ level, roleId }` (upsert on `level`) and clears the
    pending role.
  - Row 3: **remove select** — existing `level → role` entries; removes on pick.
  - Row 4: **Back · Close**.

Render functions are pure (`state → { embeds, components }`) and unit-tested;
handlers persist via a `LevelingService` / `ConfigService` method and mutate
state, matching `antinuke/panel/*`.

## Wiring

- `src/bot.js` context gains `leveling: new LevelingService(prisma)`.
- All new code under `src/modules/leveling/` (`commands/`, `events/`, `panel/`,
  `assets/`, plus pure `curve.js`, `rewards.js`, `award.js`).
- New dependency: `@napi-rs/canvas` (prebuilt, no node-gyp).

## Testing

- **Pure:** `curve` (xpForLevel/levelForXp/progress), `shouldAward` (exemptions),
  `detectLevelUp`, `resolveRewards` (highest-only add/remove), `buildRankData`.
- **Panel:** render tests (custom-ids, disabled states) + handler tests
  (persist + state mutation), mirroring `panelHandlers`/`panelRender`.
- **Rank card:** smoke test — `buildRankCard` returns a non-empty PNG buffer.
- **Leaderboard:** data/embed test.

## Out of scope (YAGNI for v1)

- Per-role / per-channel XP **multipliers**.
- Manual per-user XP editing (`/xp set|give|reset`) and reset-all.
- Voice-activity XP.
- Rank-card themes / customization.

Each is a clean follow-up once the core ships.
