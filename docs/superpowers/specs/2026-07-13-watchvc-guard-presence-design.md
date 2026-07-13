# Watch VC — "Guard" Presence

**Date:** 2026-07-13
**Module:** `watchvc`
**Status:** Design approved, pending spec review

## Purpose

A promotional / "the bot is alive and functional" indicator. In each server, an
admin points the bot at one voice channel. The bot locks that channel (visible to
everyone, no one can connect), joins it silently, and sets the channel's status to
a live "Guarding N members" badge. The bot treats the channel as a post it holds:
it rejoins on restart and returns if it is moved or disconnected, until an admin
disables the feature.

## User-facing behavior

- Admin opens `/watchvc`, an ephemeral control panel.
- Admin picks a voice channel from a dropdown and clicks **Enable**.
- On enable, the bot:
  - Edits the channel's `@everyone` permission overwrites to `ViewChannel: allow`,
    `Connect: deny` (locked but visible), and ensures the bot itself can `Connect`.
  - Joins the channel **unmuted and undeafened**, and never sends audio (silent).
  - Sets the channel status to `🛡️ Guarding {memberCount} members`.
- The status updates live as members join/leave (debounced).
- The bot holds the channel across restarts and re-joins if moved/disconnected.
- Admin clicks **Disable** to stop: the bot leaves and clears the status.

## Scope decisions (locked)

- **Configuration:** per-server, by server admins, via a single `/watchvc` panel
  command (no subcommands). Matches the `welcome` panel pattern.
- **Channel lock:** the bot enforces "locked but visible" itself on enable and on
  each (re)join. Requires **Manage Channels** + **Connect**.
- **Status badge:** live-updating, debounced to at most once per ~45s. Uses
  `guild.memberCount` (all members, including bots — "all members of the server").
- **Persistence:** persistent guard. Rejoin on startup; return to the configured
  channel with backoff if moved/disconnected; give up after N consecutive failures
  and log, rather than fight-looping.
- **Dependency:** add `@discordjs/voice` plus an encryption library
  (`libsodium-wrappers`) — discord.js core cannot open a voice connection alone.
- **Disable does not revert channel permissions.** It leaves the channel's lock
  overwrites in place (reverting could clobber admin changes made since setup) and
  says so in the panel reply.

## Architecture

New module `src/modules/watchvc/`, mirroring `src/modules/welcome/`.

```
src/modules/watchvc/
  commands/watchvc.js         # single admin-only slash command → opens panel
  panel/index.js              # load config into state, run runPanel(...)
  panel/render.js             # build ephemeral embed + components from state
  panel/handlers.js           # handle component interactions
  WatchVcService.js           # core: connections, join/leave/lock/status, timers
  events/ready.js             # reconnect to every configured watch VC on startup
  events/voiceStateUpdate.js  # detect our own move/disconnect → return to post
  events/guildMemberAdd.js    # trigger debounced status refresh
  events/guildMemberRemove.js # trigger debounced status refresh
```

`WatchVcService` is constructed in `src/bot.js` and added to `context`, like the
other services (`leveling`, `invites`, ...). It holds active voice connections
keyed by guild id, plus per-guild debounce and backoff state.

### Command + panel

`commands/watchvc.js`: a single `/watchvc` command,
`.setDefaultMemberPermissions(Administrator)` and `permissions: [Administrator]`,
whose `execute` calls `runWatchVcPanel(interaction, ctx)` — identical shape to
`commands/welcome.js`.

`panel/index.js`: loads the guild's `watchVc` config, builds panel `state`, and
calls `runPanel({ interaction, ownerId, render, handle, awaitFn: ctx.awaitFn })`
(the shared stateful panel loop in `src/lib/panel.js`).

The panel (ephemeral, admin-only, owned by the opener):
- **Embed** shows live state: configured channel, guarding on/off, connected vs.
  disconnected, and the current status text (`🛡️ Guarding N members`).
- **Voice-channel select menu** (`ChannelSelectMenu` filtered to
  `ChannelType.GuildVoice`) — sets the configured channel in state + DB.
- **Enable / Disable toggle button** — Enable locks + joins + writes status;
  Disable leaves + clears status. Disabled if no channel is selected yet.
- **"Re-assert now" button** — re-locks perms, rejoins if needed, refreshes status.

Handlers mutate `state`, persist via `ctx.config.updateWatchVc(...)`, drive the
`WatchVcService`, and let `render()` reflect the new state — the same
render/handle contract `welcome` uses.

## Data model

New Prisma model `WatchVcConfig`, mirroring the per-feature config tables
(`welcomeConfig`, `levelingConfig`, ...):

```prisma
model WatchVcConfig {
  guildId   String   @id
  channelId String?
  enabled   Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  guild     Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
}
```

- Add the relation field to the `Guild` model.
- Add `watchVc: true` to `ConfigService.INCLUDE`.
- Add `updateWatchVc(guildId, data)` to `ConfigService`, following the existing
  `getGuild` → upsert → `invalidate` pattern.
- Add `watchVcConfig.deleteMany` to `resetGuildConfig`.
- Requires a Prisma migration (`npm run db:migrate`) and client regen.

## Voice connection

- New deps: `@discordjs/voice` + `libsodium-wrappers`.
- `WatchVcService.join(channel)` uses `joinVoiceChannel({ channelId,
  guildId, adapterCreator: guild.voiceAdapterCreator, selfMute: false,
  selfDeaf: false })`. No audio player / resource is ever created, so the bot is
  silent while unmuted+undeafened.
- `GuildVoiceStates` intent is already enabled in `bot.js` — no intent change.
- Track the `VoiceConnection` per guild; wire its state-change and error events
  into the reconnection logic (section: self-healing).

## Locked-but-visible enforcement

On enable and on each (re)join, `WatchVcService.enforceLock(channel)`:
- Sets `@everyone` overwrite: `ViewChannel: allow`, `Connect: deny`.
- Ensures the bot's own member can `Connect` (via its overwrite or role perms).
- Preconditions checked first: bot has **Manage Channels** and **Connect** on the
  channel. If either is missing, the operation fails fast with a clear panel error
  and nothing is half-applied (config not marked enabled, no partial lock).

## Status badge

- Text: `🛡️ Guarding {memberCount} members`, from `guild.memberCount`.
- Written via the voice-channel-status API: prefer `VoiceChannel#setVoiceStatus`
  if the installed discord.js exposes it; otherwise a raw REST fallback
  (`client.rest.put(...voice-status...)`).
- Refreshed on: join, and member add/remove — **debounced** so at most one update
  runs per ~45s per guild (guards against raid join/leave storms hammering the
  API). The prefix/format is centralized in one constant for easy tweaking.

## Self-healing / persistence

- **Startup (`events/ready.js`):** iterate guilds with `enabled` config;
  enforce lock, join, write status for each.
- **Moved / disconnected (`events/voiceStateUpdate.js`):** when the update is for
  the bot's own id and it left or was moved off the configured channel while still
  `enabled`, schedule a return to the configured channel after a **backoff**
  (e.g. start 5s, capped). After N consecutive failed attempts, give up and log —
  no fight-loop when perms are missing or an admin is actively removing it.
- **Disable:** destroy the connection, clear the status, set `enabled = false`.

## Error handling

All of these are handled, logged, and surfaced in the panel embed — never crash
the bot:
- Configured channel deleted or no longer a voice channel.
- Bot lacking Manage Channels / Connect / status permission.
- Guild unavailable / connection failures.
`/watchvc`'s embed always reflects the true current state (configured vs.
connected vs. errored).

## Testing

Vitest units (matching `test/`), with the Discord API mocked:
- Status-text formatting from a member count.
- Debounce logic (collapses a burst into a single deferred update).
- The "should I rejoin?" decision derived from a `voiceStateUpdate` payload
  (bot id, left/moved off configured channel, still enabled).
- Permission-overwrite computation for the lock (correct allow/deny bits).
- Precondition failure path (missing Manage Channels → fail fast, not enabled).

## Out of scope (YAGNI)

- Reverting channel permissions on disable.
- Configurable status text via the panel (single centralized constant for now).
- Multiple watch channels per server (one channel per guild).
- Counting only humans / excluding bots (uses total `memberCount`).
