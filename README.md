# Joint Jagadeesan

Public, multi-server, all-in-one Discord bot — security, moderation, logging, and configuration.

> The bot's **display name** ("Joint Jagadeesan") is set in the Discord Developer Portal; this repo
> folder name is cosmetic and can stay as-is.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`.
3. In the [Discord Developer Portal](https://discord.com/developers/applications), enable the
   **Server Members Intent** (privileged). The **Message Content Intent** is only needed later
   (Phase 2 automod / full message-content logging).
4. `npm run db:migrate` to create the database tables.
5. `npm run register` to register slash commands (guild-scoped if `DEV_GUILD_ID` is set, else global).
6. `npm start` (sharded) or `npm run dev` (single process, watch mode).

## Invite permissions

Least-privilege set: View Channels, Send Messages, Embed Links, Ban Members, Kick Members,
Moderate Members, Manage Roles, Manage Channels, Manage Webhooks, Manage Server,
Manage Messages, View Audit Log. (Administrator simplifies anti-nuke reliability but is optional.)

## Scripts

- `npm test` — run unit tests (Vitest)
- `npm run lint` / `npm run format`
- `npm run register` — register slash commands
- `npm start` / `npm run dev`

## Architecture

Modular monolith, shard-ready. `src/index.js` spawns per-shard clients (`src/bot.js`), each wiring
dependency-injected core services (`src/core/`) and auto-discovering feature modules
(`src/modules/*`). See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the full design.

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

## Moderation

A numbered per-guild case system backs every action. Commands (all permission-gated and
hierarchy-safe): `/ban`, `/unban`, `/tempban`, `/softban`, `/kick`, `/timeout`, `/untimeout`,
`/warn`, `/warnings`, `/case` (view/reason/delete), `/purge`, `/slowmode`, `/lockdown`,
`/unlock`, `/nick`. Temp bans lift automatically via a once-per-minute sweep. Set the
`dmOnAction` toggle (per guild) to DM the target with the reason. Role-based `/mute` arrives
with the config phase; `/timeout` is the native equivalent today.

## Logging

Per-guild, per-category event logging, each routed to its own channel and independently
toggleable: member join/leave, message delete, message edit, role changes, channel changes,
server changes, voice state changes, and moderation actions (mirrored from the case system).
Unconfigured categories are silently skipped. Message **content** in delete/edit logs requires
the privileged **Message Content** intent; without it, those logs show a placeholder. Channels
are set in the config phase (`/logging` / `/config`).

## Configuration & Help

- `/config` — `view`, `modrole add|remove`, `dmonaction on|off`, `muterole [role]`, `reset`.
- `/logging` — `set <category> <channel>`, `disable <category>`, `enable <category>`, `view`.
- `/antinuke` — anti-nuke setup (see Anti-Nuke).
- `/help` — dynamic, category-grouped command list with `/help <command>` details and autocomplete.

Role-based `/mute` and `/unmute` use the mute role set via `/config muterole`.

## Status

Phase 1 complete: foundation, anti-nuke, moderation, logging, and config/help. Later phases
(invite tracking, auto-moderation, welcome/autorole, music, dashboard) are documented in
`docs/superpowers/specs`.
