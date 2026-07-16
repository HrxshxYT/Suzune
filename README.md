# Joint Jagadeesan

Public, multi-server, all-in-one Discord bot — security, moderation, logging, and configuration.

> The bot's **display name** ("Joint Jagadeesan") is set in the Discord Developer Portal; this repo
> folder name is cosmetic and can stay as-is.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`.
   `DATABASE_URL` is an **external** PostgreSQL connection string — the bot does not run or
   provision a database of its own, it only connects to one you point it at.
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

## Invite Tracking

Tracks who invited whom by diffing cached invite uses on join. `/invites view [user]` shows a
member's **total / regular / left / bonus** counts; `/invites leaderboard` ranks top inviters;
`/invites add <user> <amount>` and `/invites reset <user>` (Manage Server) adjust bonus invites.
Requires the bot to have **Manage Server** so it can read the invite list.

## Auto-Moderation

`/automod` (Administrator) toggles filters and picks an action (`delete` / `warn` / `timeout`):
anti-spam, anti-mention-spam, invite filter, link filter, mass-caps, and emoji spam. Members with
**Manage Messages**, exempt roles, and exempt channels are skipped (`/automod exempt`). The
content filters (invites/links, caps, emoji) require the privileged **Message Content** intent —
enable it in the Developer Portal; without it those filters simply never trigger.

## Welcome & Onboarding

- `/welcome` (Administrator) — opens a control panel to toggle welcome/goodbye messages, pick their
  channels, edit the templates, and preview them. Placeholders: `{mention} {user} {username} {server} {memberCount}`.
- `/autorole` (Manage Roles) — `add` / `remove` / `list` roles that are automatically granted to
  every member on join.
- `/reactionrole` (Manage Roles) — `add <message_id> <emoji> <role>` (run in the message's
  channel) makes reacting with that emoji self-assign the role; `remove` and `list` manage bindings.
  Uses the non-privileged **Guild Message Reactions** gateway intent (no Developer Portal toggle
  required).

## Security Dashboard & Scan

Two admin tools (**Manage Server**) turn the security posture into a picture. Both render a
purple **liquid-glass** card image (iOS-26 style, `@napi-rs/canvas`) hosted in an embed, and both
compute the same analytics: a **System Integrity Index** (0–100 %) with a tier
(**PROTECTED / GUARDED / ELEVATED / AT RISK**) plus roles, admin roles, threat roles, permission
risk, channels, privileged users, threat users, integrations, webhook assets, and member count.
The card is tinted by the tier so it reads as an index at a glance; threat metrics turn red when
non-zero.

- `/dashboard` — posts a **live** dashboard that regenerates its card and **refreshes every 5
  seconds** (a bounded, self-cleaning loop that stops when the message is deleted). Shows which
  protections are enabled (Anti-Nuke, Anti-Raid, Auto-Mod, Auto-Revert, Panic Mode, Mod Logging)
  and the member count.
- `/scan` — runs a **deep, one-shot security audit** and returns a graded report (A+ → F). It
  detects **threats and broken roles**: disabled protections, dangerous `@everyone` permissions,
  un-vouched administrators, unmanaged admin roles, privileged roles ranked **above the bot** (which
  the bot can't act on), missing bot permissions, unaccountable webhooks, low verification level, and
  no 2FA requirement. Findings are prioritised critical → warning → info, and it **recommends the
  exact settings the owner/admin should turn on** (e.g. `/antinuke enable`, `/automod`, `/logging`,
  `/antinuke whitelist add`). Needs **Manage Webhooks** to audit webhook assets; it degrades
  gracefully without it.

## Utility

`/ping` renders a glass **bot-health** card (gateway latency + a latency-trend sparkline + uptime)
inside an embed. `/avatar [user]` shows a user's avatar with download links. `/serverinfo` and
`/userinfo` show server/user details.

## Leveling

Message-based XP and levels. `/levels` (Administrator) opens a control panel to enable leveling,
toggle level-up announcements, set the XP range and per-user cooldown, pick ignored channels/roles,
and configure **role rewards** (highest-only — a member keeps only their current tier). Members earn
a random amount of XP per message (rate-limited); level-ups are announced in the channel where they
happen. `/rank [user]` renders a glass image rank card in an embed; `/leaderboard` shows the server's top members by
XP. Counting uses message events only — no Message Content intent required.

## Audit Log

`/auditlog` (Administrator) posts a single consolidated, green-themed feed of **everything** that
changes in the server to one channel — complementary to the per-category `/logging`.

- `/auditlog channel #log` — set the channel and enable the feed.
- `/auditlog events` — a **button dashboard** to toggle which categories are tracked.
- `/auditlog disable` / `/auditlog view`.
- **Coverage:** member join/leave, bans/unbans, member edits (nickname, roles, timeout), message
  edits/deletes/bulk-deletes, channel create/delete/update, role create/delete/update, server
  settings, emojis & stickers, threads, voice activity, and invites. Where the gateway allows,
  entries are attributed to the responsible user via the audit log. Guild-level only (Discord does
  not reliably deliver global username/avatar changes).

## Interface & theme

- **Green-forward embeds** across the bot (errors stay red, warnings amber).
- **Purple liquid-glass image cards** (iOS-26 style) for `/dashboard`, `/scan`, `/ping`, and
  `/rank`, sharing one card kit (`src/lib/glassCard.js`).
- **Interactive buttons:** paged `/help` and `/invites leaderboard`, an interactive `/tutorial`
  walkthrough, **Confirm/Cancel** prompts on destructive moderation (`ban/kick/unban/softban/
  tempban/purge`), and a `/automod panel` button dashboard. Buttons are owner-gated and expire
  after a few minutes.
- `/tutorial` — a guided, button-navigated tour of every feature.

## Tickets

Run `/tickets` to open the ticket control panel. Create one or more **panels**,
each with a **category dropdown**; publish a panel to any channel. Members pick a
category to open a private ticket channel (optional reason modal). Staff can
**claim**, **add/remove members**, and **close** — a two-stage flow that archives,
saves a plain-text transcript to the configured channel (optionally DMing the
opener), then deletes the channel.

## Status

Phase 1 complete. **UI overhaul shipped**: green theme, interactive buttons, `/tutorial`, and a
consolidated `/auditlog` feed. Phase 2 (leveling, tickets, starboard, giveaways) is underway —
**leveling** and **tickets** are shipped (2 of 4); starboard and giveaways are next.
