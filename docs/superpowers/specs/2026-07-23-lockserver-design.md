# /lockserver — Server-Wide Lockdown with Exact-State Restore

**Date:** 2026-07-23
**Module:** `lockdown`
**Status:** Design approved, pending spec review

## Purpose

Give admins a server-level lockdown tool that halts a live raid fast and then
restores the server to **exactly** its prior permission state — including
overwrites that were neutral (unset) before, which naive lockdowns silently
convert to `allow` and quietly destroy the server's permission structure.

The existing per-channel `/lockdown` and `/unlock` are unchanged. They deny/reset
`SendMessages` on the current channel and reset to `null` blindly (they cannot
restore a prior explicit `allow`). `/lockserver` is the server-wide tool and does
snapshot-based restore.

## The requirement that matters most

Before touching any permission overwrite, snapshot its **exact prior state** —
`allow` / `deny` / `neutral (unset)` as three distinct states — and persist it in
Postgres. On unlock, restore precisely that, restoring an overwrite to neutral
rather than to allow. If the snapshot row is missing or the snapshot set is
corrupt, **refuse to auto-unlock** and tell the admin explicitly rather than
guessing. Snapshots live in Postgres, not memory: a restart mid-lockdown must not
strand a server.

## User-facing behavior

Command: `/lockserver` with subcommands (Discord-idiomatic; each tier is a
subcommand so `status` can stand apart with no duration/reason options):

- `/lockserver panic  [duration] [reason]`
- `/lockserver channels [channels] [duration] [reason]`  (optional channel subset)
- `/lockserver invites [duration] [reason]`
- `/lockserver joins   [duration] [reason]`
- `/lockserver voice   [duration] [reason]`
- `/lockserver full    [duration] [reason]`
- `/lockserver status`
- `/unlockserver`  (separate command)

`duration` is optional (`30m`, `2h`), parsed by the existing
`src/lib/duration.js`. Omitted → indefinite until `/unlockserver`.

### Tier behaviour (locked)

| Tier | Action | Snapshot |
|------|--------|----------|
| `panic` | Strip `SendMessages` from the `@everyone` **role** guild-wide. One API call, instant. Deliberately imperfect — channels with an explicit `allow` overwrite survive — because during a live raid speed beats completeness. | role / `@everyone` / `SendMessages` prior bit |
| `channels` | Per text channel (`GuildText`, `GuildAnnouncement`, `GuildForum`), or a supplied subset: deny `SendMessages` on `@everyone`. Correct but N API calls. Batched. | overwrite tri-state per touched target/field |
| `invites` | `guild.disableInvites(true)` — set the guild "invites paused" flag only. **Never mass-delete invite links** (destructive, irreversible). | `invitesPausedByUs` flag on state |
| `joins` | Raise guild verification level to its maximum (`VERY_HIGH`); record the prior level. | `priorVerificationLevel` on state |
| `voice` | Per voice/stage channel: deny `Connect` + `Speak` on `@everyone`. | overwrite tri-state per touched target/field |
| `full` | `panic → channels → invites → joins → voice`, applied in that order so the fastest protection lands first. | union of the above |

### Always-exempt

Guild owner and the bot are never subjects of any effect. The bot keeps
Administrator; owner is never in an `@everyone` deny anyway. We never write
member-specific overwrites for owner/bot.

### Staff bypass

Before applying denies, ensure the configured mod roles (`/config modrole`) hold an
explicit `allow` of the same field(s) — `SendMessages` for `channels`,
`Connect`+`Speak` for `voice` — so staff can still coordinate inside a locked
server. Each such allow is snapshotted with `addedByUs = true`; on unlock it is
removed **only if we added it** (prior was neutral/deny). `panic` and `joins`/
`invites` do not carry staff-bypass overwrites (panic is role-level and
deliberately imperfect; joins/invites are guild-level).

## Data model (Prisma)

```prisma
model LockdownState {
  id                     String   @id @default(cuid())
  guildId                String   @unique
  guild                  Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
  tier                   String   // panic|channels|invites|joins|voice|full
  reason                 String   @default("No reason provided")
  startedById            String
  startedAt              DateTime @default(now())
  expiresAt              DateTime?
  priorVerificationLevel Int?
  invitesPausedByUs      Boolean  @default(false)
  caseNumber             Int?
  status                 String   @default("active") // active|lifted|failed
  snapshots              LockdownSnapshot[]
  @@index([expiresAt])
}

model LockdownSnapshot {
  id         String        @id @default(cuid())
  lockdownId String
  lockdown   LockdownState @relation(fields: [lockdownId], references: [id], onDelete: Cascade)
  targetType String        // channel|role|guild
  targetId   String
  field      String        // SendMessages | Connect | Speak
  priorAllow Boolean       // tri-state encoding:
  priorDeny  Boolean       //   allow → (true,false)  deny → (false,true)  neutral → (false,false)
  addedByUs  Boolean       @default(false)
  @@index([lockdownId])
}
```

`Guild` gains `lockdown LockdownState?`. Migration `20260723000000_lockdown`
written by hand (no live DB in this environment; applies on deploy). Index on
`expiresAt` for the sweep.

### Tri-state ↔ discord.js

The encoding maps directly onto `permissionOverwrites.edit(target, { Field: v })`:
`true` = allow, `false` = deny, `null` = neutral. Restore reads each snapshot row
and sets `priorAllow ? true : priorDeny ? false : null`. Neutral restores to
`null`, never `true` — the core correctness property.

## Restore & corruption refusal

`/unlockserver` and the sweep read `LockdownState` + snapshots **from the DB**
(restart-safe; nothing depends on in-memory state). Rules:

- **Missing / corrupt snapshot set** (no state row, or a tier that requires
  overwrite snapshots has none/unparseable) → **refuse**, report to the admin,
  leave everything as-is, log it. Do not guess.
- **Per-target restore failure** (missing perms, bot role too low) → collect the
  failures, restore everything else, report which targets failed. Snapshots are
  deleted only after a fully successful restore, so a partial unlock remains
  re-runnable and fully restorable.
- Verification level restored from `priorVerificationLevel`; invites un-paused
  only if `invitesPausedByUs`; staff-bypass allows removed only where
  `addedByUs`.

## Idempotency, duration, sweep, anti-nuke, logging

- **Idempotent:** if a lockdown is already `active`, `/lockserver <tier>` never
  re-snapshots. It replies with current status (text) and directs the admin to
  `/unlockserver` first. The already-locked state is never captured as a snapshot.
- **Duration → sweep:** the existing once-per-minute `mod-expiry` job is extended
  to also call `ctx.lockdown.sweepExpired(now)`. No second scheduler/timer is
  introduced. The sweep lifts each expired lockdown exactly once (status flips
  `active → lifted`).
- **Rate limits:** `batch.js` runs a fixed-size worker pool (concurrency 6) over
  the channel list; discord.js's bucket queue absorbs 429s; progress is
  `editReply`-ed on the original interaction, throttled ("locked 120/300
  channels"). Requests are never all fired at once.
- **Anti-nuke integration:** new opt-in `AntinukeConfig.autoLockOnTrigger`
  (default `false`). When the orchestrator punishes or anti-raid fires and the
  flag is on, it calls `ctx.lockdown.panic(guild, …)` — the same service path,
  not duplicated logic.
- **Logging:** a numbered `Case` (type `lockdown` / `unlockserver`, `targetId` =
  actor) is created, which the existing `caseCreated` listener logs to the
  `modActions` category; plus a detailed embed (who, tier, reason, duration,
  locked/failed counts, verification & invite changes) is sent to the anti-nuke
  alert channel.
- **Permissions:** `Administrator` **or** `ManageGuild`. (The spec text says
  "Administrator or Manage Server"; `/lockdown` today uses the weaker
  `ManageChannels`, inappropriate for a server-wide tool. Administrator/ManageGuild
  wins.) Enforced via `permissions` + `setDefaultMemberPermissions(ManageGuild)`,
  consistent with the existing `PermissionService` (mod-role fallback still
  applies).

## Module layout

```
src/modules/lockdown/
  LockdownService.js     # orchestration + all DB access (start/unlock/status/panic)
  snapshot.js            # pure: capture & restore overwrite tri-state
  tiers.js               # per-tier apply fns: panic, channels, invites, joins, voice
  batch.js               # concurrency-limited runner with progress callback
  sweep.js               # sweepExpiredLockdowns(service, now)
  logging.js             # build + emit lock/unlock/failure logs
  embeds.js              # status / result / failure embeds (purple-forward)
  commands/lockserver.js
  commands/unlockserver.js
```

`LockdownService` is injected as `ctx.lockdown` in `src/bot.js`. Snapshot/restore
and tiers take an injected guild + prisma so they unit-test without real
discord.js.

## Testing (Vitest, mocked prisma + fake guild/channels)

1. **Snapshot round-trip:** neutral → deny → restore issues `edit(..., null)`,
   not `true`.
2. **Restore after simulated restart:** service reads `LockdownState` + snapshots
   from mocked DB (no in-memory state) and restores.
3. **Partial-failure lockdown:** a worker throws for some channels; the rest still
   restore, failures are recorded, and snapshots are retained (still restorable).
4. **Idempotency:** a second `/lockserver` call while active does not capture or
   overwrite the snapshot.
5. **Sweep:** an expired lockdown is unlocked exactly once; a second sweep finds
   nothing.
6. **Staff-bypass:** allow added on lock (`addedByUs = true`), removed on unlock
   only where `addedByUs`.

## Non-goals

- Do not touch the existing per-channel `/lockdown` / `/unlock`.
- Do not delete invites.
- Do not kick or ban anyone as part of lockdown.
- Do not add new dependencies.
