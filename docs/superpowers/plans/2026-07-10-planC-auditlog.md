# Plan C — `/auditlog` Consolidated Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** A single `/auditlog` channel that receives a green, attributed feed of every server & member change, with per-category toggles.

**Architecture:** Self-contained `src/modules/audit/`. Pure `shouldPost`/format builders are unit-tested; a shared `postAudit` dispatcher gates on config; listeners are thin. The event loader is extended to accept an array default export so all listeners live in one file.

**Tech Stack:** Node.js 25 ESM, discord.js v14, PostgreSQL/Prisma, Vitest. All required intents already enabled.

## Global Constraints
- Green theme (`brandEmbed`), `BOT_NAME`. TDD, commit per task. Guild-level tracking only (no global avatar/username). Reuse Stage 1/2 primitives (`toggleRow`, `runToggler`).

---

### Task 1: Loader supports array default export
**Files:** Modify `src/core/EventHandler.js`; Test `test/core/eventLoader.test.js`
- In `discoverEvents`, if `mod.default` is an array, push each element; else push the one. Interface unchanged otherwise.
```js
if (mod.default) {
  if (Array.isArray(mod.default)) listeners.push(...mod.default);
  else listeners.push(mod.default);
}
```
Test: a fake dir isn't needed — unit-test the branch by calling `discoverEvents` on `src/modules` and asserting it still returns an array of listeners with `.name`/`.execute`. (Add the array file in Task 4; here just add + test the guard by importing the function and checking existing discovery still works: `expect((await discoverEvents(modulesDir)).length).toBeGreaterThan(0)`.)

---

### Task 2: Schema + config + dispatch
**Files:** Modify `prisma/schema.prisma` (AuditConfig + Guild relation), `src/core/ConfigService.js` (INCLUDE `audit:true`, `updateAudit`, reset); Create `src/modules/audit/dispatch.js`; Test `test/modules/audit/dispatch.test.js`, extend ConfigService test.
- `AuditConfig { guildId @id, guild rel cascade, enabled Boolean @default(false), channelId String?, events Json @default("{}") }`; `audit AuditConfig?` on Guild.
- `ConfigService.updateAudit(guildId, data)` (upsert + invalidate); clear in `resetGuildConfig`.
- `shouldPost(config, category) -> bool`: `config?.enabled && config.channelId && config.events?.[category] !== false`.
- `postAudit(ctx, guild, category, embed)`: read `(await ctx.config.getGuild(guild.id)).audit`; if `shouldPost`, fetch channel, send embed (best-effort).
- Migrate: `npx prisma migrate dev --name auditlog` against local Postgres.
Tests: `shouldPost` truth table; `updateAudit` upserts + invalidates.

---

### Task 3: Categories + attribution + format builders
**Files:** Create `src/modules/audit/categories.js`, `src/modules/audit/attribution.js`, `src/modules/audit/format.js`; Test `test/modules/audit/format.test.js`
- `categories.js`: `CATEGORIES = [{key,label}...]` for members, memberEdits, bans, messages, channels, roles, server, emojis, threads, voice, invites; `CATEGORY_KEYS`.
- `attribution.js`: `fetchActor(guild, auditType, targetId) -> Promise<{ tag, id, reason }|null>` — best-effort `guild.fetchAuditLogs`, match newest entry within ~5s on target; swallow errors.
- `format.js`: `auditEmbed({ title, description, fields, thumbnail }) -> brandEmbed`; plus pure builders: `memberJoin(member)`, `memberLeave(member)`, `messageDelete(msg)`, `messageEdit(oldM,newM)`, `memberDiff(oldM,newM)` (nickname/roles/timeout deltas → description or null when nothing relevant changed).
Tests: `memberDiff` returns null on no-op and a description when the nickname changes; `messageDelete` includes author + content.

---

### Task 4: Listeners (one array file)
**Files:** Create `src/modules/audit/events/audit.js` (array default export); Test `test/modules/audit/listeners.test.js`
- Export an array of `{ name, execute(ctx, ...args) }` for: guildMemberAdd(members), guildMemberRemove(members), guildBanAdd(bans), guildBanRemove(bans), guildMemberUpdate(memberEdits), messageUpdate(messages), messageDelete(messages), messageDeleteBulk(messages), channelCreate/Delete/Update(channels), roleCreate/Delete/Update(roles), guildUpdate(server), emojiCreate/Delete(emojis), stickerCreate/Delete(emojis), threadCreate/Delete(threads), voiceStateUpdate(voice), inviteCreate/Delete(invites).
- Each builds an embed (via format.js or inline `auditEmbed`) and calls `postAudit(ctx, guild, category, embed)`; ignores bot/self noise where relevant; wrapped in try/catch.
Test: invoking the `messageDelete` listener with a mock ctx whose `postAudit` is spied (inject via `ctx`) calls it with category `messages`. (Listeners call the module `postAudit`; to test, export a thin `handlers` map or have listeners read `ctx.postAudit ?? postAudit`.) Use `ctx.postAudit` override for tests, default to the real one.

---

### Task 5: `/auditlog` command
**Files:** Create `src/modules/audit/commands/auditlog.js`; Test `test/modules/audit/auditlogCommand.test.js`
- Administrator. Subcommands: `channel <#c>` (set+enable), `disable`, `view` (green panel of state), `events` (runToggler over CATEGORIES; `onToggle(key)` flips `events[key]` via `updateAudit`).
Tests: `channel` calls `updateAudit` with `{enabled:true, channelId}`; `disable` with `{enabled:false}`; `events` toggling a key persists.

---

### Task 6: Verify + docs + finish
- Full `npx vitest run`, eslint, loader probe (29 commands incl `auditlog`; listener count jumps), boot check.
- README: add Audit Log section. Update memory. Register commands. Merge Plan C to `main`.

## Self-Review
Covers array-loader (T1), schema/config/dispatch (T2), categories/attribution/format (T3), listeners (T4), command (T5), verify (T6). Category keys consistent across categories.js, format usage, and the command's toggle panel. `shouldPost` semantics identical in dispatch and command view.
