# Discord Bot

Public, multi-server security & moderation bot (Phase 1: foundation).

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

## Status

Phase 1 foundation + Phase 2 anti-nuke complete. Remaining modules (moderation, logging, config,
help) land in follow-up plans.
