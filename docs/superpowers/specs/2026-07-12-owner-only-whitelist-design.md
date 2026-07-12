# Restrict anti-nuke whitelist add/remove to the Discord server owner

**Date:** 2026-07-12

## Goal

Only the Discord server owner (`guild.ownerId`) may add or remove entries in the
anti-nuke whitelist. Other administrators can still open the `/antinuke` control
panel and use every other control; the whitelist add/remove menus are disabled
for them (with an explanatory note), and the backend rejects any attempt as a
safety net.

Scope is **add + remove only**. The `/antinuke` command's `Administrator` gate
and the whitelist-limits sub-view are unchanged.

## Naming note

In the panel code, `state.ownerId` is the **panel session owner** (whoever opened
the panel), not the Discord server owner. The panel loop already ensures only that
person can click. To avoid confusion we introduce a separate, clearly-named
`state.serverOwnerId = interaction.guild.ownerId`.

## Changes

### `src/modules/antinuke/panel/index.js`
Add `serverOwnerId: interaction.guild.ownerId` to the panel `state`.

### `src/modules/antinuke/panel/render.js` — `buildWhitelistView`
- Compute `const canEdit = state.serverOwnerId === o;`
- Add (mentionable) select: `.setDisabled(!canEdit)`.
- Remove (string) select: `.setDisabled(!canEdit)`.
- When `!canEdit`, append a footer note to the embed:
  "🔒 Only the server owner can change the whitelist."
- Back/Close buttons stay enabled.

### `src/modules/antinuke/panel/handlers.js` — `wl` branch (`add` / `remove`)
Guard at the top of the add and remove handling:

```js
if (i.user.id !== state.serverOwnerId) {
  await i.reply({
    embeds: [errorEmbed("Only the server owner can change the anti-nuke whitelist.")],
    ephemeral: true,
  });
  return "handled";
}
```

`"handled"` tells the panel loop the interaction was already answered (same
pattern as the advanced-settings modal).

## Testing

- `panelHandlers.test.js`: add `serverOwnerId` to the shared test states (equal to
  `ownerId` so existing add/remove tests stay green). Add two cases: non-owner add
  and non-owner remove are rejected (no `addWhitelist`/`removeWhitelist` call,
  returns `"handled"`, replies ephemerally).
- `panelRender.test.js`: whitelist add/remove controls are disabled when the panel
  opener is not the server owner, and enabled when they are.

## Out of scope

- Whitelist-limits sub-view permissions.
- The `Administrator` default-member-permission gate on `/antinuke`.
