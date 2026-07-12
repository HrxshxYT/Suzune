# Anti-Nuke & Audit-Log Interactive Control Panels

**Date:** 2026-07-11
**Status:** Approved (pending spec review)

## Goal

Replace the multi-subcommand `/antinuke` and `/auditlog` configuration flows with a
single interactive, one-message **control panel** each. Every setting is reachable
from buttons and native select menus on one embed — no need to remember subcommands.

## Decisions (from brainstorming)

- **Input style:** buttons for toggles + native Discord select menus for value inputs
  (punishment, channel, role, whitelist target).
- **Entry point:** `/antinuke` and `/auditlog` (bare, admin-only) open their panel
  directly. All existing subcommands are removed and folded into the panels.
- **Advanced settings:** an **Advanced…** button opens a modal for the two raid
  numbers (join count, window seconds). Per-action `thresholds` are intentionally
  out of scope for now (no existing UI, doesn't fit a modal) — possible follow-up.
- **Whitelist:** folded into the anti-nuke panel. A **Whitelist** button opens a
  sub-view that lists the current whitelisted users/roles **in the embed**, with a
  mentionable select to add and buttons to remove/return.
- **Visibility:** panels are ephemeral (only the invoking admin sees them).

### Discord constraint that shaped this

A slash command cannot be both directly invokable and own subcommands. Because
`/antinuke` and `/auditlog` are now bare, they cannot also expose `whitelist` /
`whitelistview` / `channel` / `events` subcommands. Everything moves into the panel.
This supersedes and removes the `/antinuke whitelist`, `/antinuke whitelistview`,
`/auditlog channel`, `/auditlog disable`, `/auditlog events`, and `/auditlog view`
subcommands (the `whitelistview` subcommand added earlier in this branch is removed).

## Anti-Nuke Control Panel

### Main view (one message, ≤5 action rows)

```
🛡️ Anti-Nuke Control Panel
🟢 ON · Punish: ban · Alert: #alerts · Quarantine: @Muted · Whitelist: 3
──────────────────────────────────────────────
Row1: [🟢 Enabled][🔴 Panic][🟢 Auto-revert][🔴 Anti-raid]
Row2: [ Punishment ▼  ban | kick | strip | quarantine | removeperms ]
Row3: [ Alert channel ▼   (ChannelSelectMenu, GuildText) ]
Row4: [ Quarantine role ▼ (RoleSelectMenu) ]
Row5: [ Advanced… ][ Whitelist ][ Close ]
```

- **Toggle buttons** flip a boolean (`enabled`, `panicMode`, `autoRevert`,
  `antiRaidEnabled`), persist via `ctx.config.updateAntinuke`, re-render. Green
  (Success) = on, grey (Secondary) = off, with 🟢/🔴 label prefix.
- **Punishment** string select sets `punishment`.
- **Alert channel** channel select sets `alertChannelId` (GuildText only).
- **Quarantine role** role select sets `quarantineRoleId`.
- **Advanced…** opens a modal with number inputs: `raidJoinCount`, `raidWindowSec`.
  On submit, values are validated (positive integers) and persisted; invalid input
  shows an ephemeral error and leaves config unchanged.
- **Whitelist** switches the same message to the whitelist sub-view.
- **Close** disables all components and ends the collector.

### Whitelist sub-view (one message, ≤5 rows)

```
🛡️ Anti-Nuke · Whitelist
These users/roles bypass anti-nuke entirely.
👤 Users (2): @alice, @bob
🎭 Roles (1): @Admins
──────────────────────────────────────────────
Row1: [ Add to whitelist ▼ (MentionableSelectMenu — user or role) ]
Row2: [ Remove from whitelist ▼ (StringSelectMenu of current entries) ]
Row3: [ ◀ Back ][ Close ]
```

- The **embed body renders the full list** (users and roles as mentions), reusing
  `buildWhitelistEmbed`-style formatting.
- **Add** mentionable select → `addWhitelist(guildId, id, type, adderId)`; `type`
  derived from whether the selected value is a role or a user.
- **Remove** string select is populated from current entries (label = resolved
  name/mention, value = targetId) → `removeWhitelist(guildId, targetId)`.
- **Back** returns to the main anti-nuke view; **Close** ends the collector.
- If the whitelist is empty, the embed shows the empty-state hint and the Remove
  select is omitted (or disabled).

## Audit-Log Control Panel

### Main view (one message, 5 rows)

```
📋 Audit Log Control Panel
Status: 🟢 ON · Channel: #audit-log
──────────────────────────────────────────────
Row1: [ Log channel ▼ (ChannelSelectMenu, GuildText — setting it enables the feed) ]
Row2: [🟢 Members][🟢 Member edits][🟢 Bans][🟢 Messages][🟢 Channels]
Row3: [🟢 Roles][🟢 Server][🟢 Emojis][🟢 Threads][🟢 Voice]
Row4: [🟢 Invites][ All on ][ All off ]
Row5: [ 🔴 Disable feed ][ Close ]
```

- 11 category toggle buttons (short labels), green when tracked. A category is
  "on" when `audit.events[key] !== false` (missing key defaults on), matching
  existing `isOn` semantics. Clicking flips it via `updateAudit({ events })`.
- **Log channel** select sets `channelId` and `enabled: true`.
- **All on / All off** set every category on/off in one write.
- **Disable feed** sets `enabled: false` (keeps channel + category choices).
- **Close** disables components and ends the collector.

## Shared Infrastructure

- **`lib/collect.js`**: add `awaitComponent({ message, ownerId, timeMs })` that awaits
  any message component (button or any select) with the existing owner filter.
  Keep `awaitButton` for existing callers.
- **`lib/panel.js`** (new): `runPanel({ interaction, ownerId, render, handle, awaitFn,
  timeMs })`.
  - `render(state)` → `{ embeds, components }` (pure).
  - Loop: reply/`fetchReply` → `awaitFn` → `handle(componentInteraction, state)` →
    the handler persists changes, may mutate `state`, and returns a directive
    (`"update" | "close" | "modal"`). For `"update"` the runner calls
    `i.update(render(state))`; for `"modal"` the handler itself calls `showModal`
    and awaits submit, then the runner re-renders via `editReply`; for `"close"`
    the runner disables components and exits.
  - `awaitFn` is injectable for tests (same pattern as `runToggler`).
- **`interactionCreate` guard**: broaden the early-return to
  `interaction.isMessageComponent?.() || interaction.isModalSubmit?.()` so channel/
  role/mentionable selects and modal submits are always left to per-message
  collectors (buttons + string selects already were).

### Module layout

```
src/modules/antinuke/panel/
  render.js    — buildMainView(config) / buildWhitelistView(config, guild) → {embeds, components}
  handlers.js  — pure-ish handlers: applyToggle, applySelect, applyAdvanced, whitelist add/remove
  index.js     — runAntinukePanel(interaction, ctx): wires render+handlers into runPanel
src/modules/antinuke/commands/antinuke.js  — bare command → runAntinukePanel

src/modules/audit/panel/
  render.js    — buildAuditView(audit) → {embeds, components}
  handlers.js  — category toggle, all-on/off, channel set, disable
  index.js     — runAuditPanel(interaction, ctx)
src/modules/audit/commands/auditlog.js      — bare command → runAuditPanel
```

`src/modules/audit/categories.js` gains a short `btn` label per category for the
button UI (falls back to `label`). `src/modules/antinuke/statusEmbed.js`
`buildWhitelistEmbed` is reused (or its list formatting is shared) by the whitelist
sub-view.

## Custom-ID scheme

Namespaced, owner-scoped to survive stray clicks and support the collector filter:

```
an:tog:<field>:<ownerId>          toggle boolean
an:sel:punishment:<ownerId>       punishment string select
an:sel:alert:<ownerId>            alert channel select
an:sel:qrole:<ownerId>            quarantine role select
an:adv:<ownerId>                  advanced modal button
an:wl:open:<ownerId> / an:wl:back / an:wl:add / an:wl:remove
an:close:<ownerId>

au:cat:<key>:<ownerId>            category toggle
au:all:on / au:all:off / au:chan / au:disable / au:close  (+:<ownerId>)
```

The owner filter already lives in `ownerFilter`; the `ownerId` suffix is belt-and-braces.

## Error handling

- All config writes go through `ConfigService`, which invalidates its cache.
- Modal input validated (positive integers); bad input → ephemeral error, no write.
- Collector timeout (default 150s) → disable all components, stop.
- DM/permission or unknown-interaction failures are caught and logged; the panel
  never throws out of the command handler (`runSafely` still wraps `execute`).

## Testing

- **Render (pure):** main/whitelist/audit views reflect state — correct toggle
  colors, ≤5 rows, punishment/channel/role selects present, whitelist list text,
  category on/off. Snapshot-ish assertions on `embed.data` + component customIds.
- **Handlers:** toggle flips and calls `updateAntinuke` with the right field;
  selects persist the chosen value; audit category toggle flips `events[key]`;
  all-on/off writes every key; whitelist add derives correct `type`, remove calls
  `removeWhitelist`; advanced modal handler validates and persists numbers.
- **Runner loop:** `runPanel` with a scripted fake `awaitFn` yielding a sequence of
  fake component interactions asserts render→persist→update ordering, whitelist
  open/back navigation, and clean close/timeout (components disabled).
- Command-level: `/antinuke` and `/auditlog` have no subcommands and are admin-gated.

## Out of scope / follow-ups

- Per-action anti-nuke `thresholds` editing UI.
- Pagination for very large whitelists (mentionable/string selects cap at 25
  options; if entries exceed the select limit, show the first 25 for removal and
  note the overflow — full pager is a follow-up).
