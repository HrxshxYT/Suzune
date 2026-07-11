# `/serverinfo` and `/userinfo` slash commands

**Date:** 2026-07-12

## Goal

Add two informational slash commands to the `util` module:

- `/serverinfo` — a rich summary of the current guild.
- `/userinfo [user]` — a rich summary of a user (defaults to the caller).

Both require no special permissions and reply publicly in-channel. They follow
the existing command shape (`{ data, permissions, execute }`) and are
auto-discovered from `src/modules/util/commands/`.

## Presence intent

`/userinfo` shows the target's online/presence status. This requires the
privileged `GuildPresences` gateway intent, which is **not** currently enabled.
This spec adds `GatewayIntentBits.GuildPresences` to the client in `src/bot.js`.
The intent has also been enabled in the Discord developer portal.

## `/serverinfo`

Brand embed, server icon as thumbnail. Fields:

- **Owner** — `<@ownerId>`
- **Server ID** — `guild.id`
- **Created** — `<t:unix:F>` + `<t:unix:R>`
- **Members** — `guild.memberCount`
- **Channels** — text / voice / category / stage / other, counted from
  `guild.channels.cache`
- **Roles** — `guild.roles.cache.size - 1` (excludes `@everyone`)
- **Emojis / Stickers** — `guild.emojis.cache.size` / `guild.stickers.cache.size`
  (GuildEmojisAndStickers intent is enabled)
- **Boosts** — `guild.premiumSubscriptionCount` at tier `guild.premiumTier`
- **Verification level** — humanized `guild.verificationLevel`
- **AFK** — `guild.afkChannelId` (`<#id>` or "None") + timeout
- **Features** — notable `guild.features`, truncated to the embed field limit

## `/userinfo [user]`

Optional `user` option (defaults to `interaction.user`). The command calls
`await user.fetch()` to populate badges/flags and banner. It resolves the guild
member (`guild.members.fetch(user.id)`, may be null). Brand embed, avatar as
thumbnail. Fields:

- **User** — mention + tag; note **Bot** if `user.bot`
- **User ID** — `user.id`
- **Account created** — `<t:unix:F>` + `<t:unix:R>`
- **Status** — `member.presence?.status` humanized (online / idle / dnd /
  offline); "Unknown" if no presence data
- **Joined server** — `member.joinedTimestamp` as `<t:…:F>` + `<t:…:R>`; when the
  user is not a member, show "Not in this server" and omit member-only fields
- **Nickname** — `member.nickname` (member only)
- **Roles** — top roles listed (highest first, capped) + total count (member only)
- **Key permissions** — notable perms from `member.permissions` (Administrator,
  ManageGuild, ManageRoles, ManageChannels, BanMembers, KickMembers,
  ModerateMembers, ManageMessages), or "Administrator" shorthand (member only)
- **Badges** — humanized `user.flags` (e.g. HypeSquad, Active Developer, Nitro)
- **Banner** — `user.bannerURL({ size: 512 })` as the embed image, if present

## Shared helpers

Small internal formatting helpers live alongside the commands (or a tiny shared
`format.js` under `util/`) — e.g. humanizing verification levels, permission
names, and user flags. Keep them local to the util module; no changes to
`src/lib`.

## Testing

`test/modules/util/serverinfo.test.js` and `test/modules/util/userinfo.test.js`,
matching the `ping.test.js` style:

- Command name is correct and `permissions` is `[]`.
- `execute` replies with an embed given a mocked interaction/guild/user.
- `userinfo` defaults to the caller when no `user` option is given, and handles a
  target who is not a guild member (no crash, "Not in this server").

## Out of scope

- Context-menu (right-click) versions of these commands.
- Caching or pagination of long role/feature lists beyond simple truncation.
