# AutoMod v2 — Five-Stage Detection Pipeline

**Date:** 2026-07-24
**Status:** Approved design, pending implementation plan
**Scope:** Full rewrite of `src/modules/automod` around an `extract → normalize → evaluate → score → act` pipeline, plus a new reusable heat/scoring core service. Native Discord AutoMod provisioning (the "Uses AutoMod" badge) is preserved and re-fed from the new rule packs.

---

## 1. Problem

The current runtime filter (`evaluate.js` + `filters.js`) matches six fixed categories (`antiSpam`, `antiMentionSpam`, `filterInvites`, `filterLinks`, `antiCaps`, `antiEmojiSpam`) against **raw `message.content` only**, first-match-wins, and punishes immediately via a single global `action`. This loses to every modern scam: attackers evade at the character level (homoglyphs, zero-width joiners, spaced-out text), which raw-substring matching never sees. A single caps violation and a single scam link are also treated as equal, so there is no way to accumulate signal before acting.

Separately, `native/rules.js` provisions real Discord AutoMod rules via the AutoModeration API (source of the guild's "Uses AutoMod" badge). That subsystem works and must not regress.

## 2. Goals

- Normalize text before matching so evasion at the character level is defeated (**highest-value work**).
- Replace fixed filters with a weighted rule model where **rules contribute heat, not punish directly**; punishment fires at a configurable cumulative threshold.
- Ship curated, versioned, centrally-updatable **rule packs** as the primary interface; user-written regex is the escape hatch beneath.
- Make the regex engine a **remote-DoS-proof** `re2`, with compile caching, limits, and a self-healing per-message time budget.
- Provide **per-rule dry-run (log-only)** so an admin can trial a rule against live traffic before it punishes anyone.
- Build a reusable **heat/scoring core service** in `src/core/` that anti-nuke and the join gate can later consume.
- **Preserve** native AutoMod provisioning and all existing exemptions.

## 3. Non-goals (this pass)

- Following URL shorteners / redirect resolution (SSRF surface — deferred; known shortener hosts are flagged as heat instead).
- Persisting heat across restarts (heat is an ephemeral, short-half-life signal).
- Migrating anti-nuke or the join gate onto `HeatService` (the service is built to be consumable; wiring them is future work).
- ML/heuristic classification beyond rules + URL analysis.

## 4. Architecture

```
messageCreate
  └─ exempt check (ManageMessages | exempt role | exempt channel) ─ skip if exempt
       └─ Stage 1  extract   → { raw, embeds, filenames, stickerNames, displayName, urls[] }
            └─ Stage 2  normalize → { raw, normalized, stripped }
                 └─ Stage 3  evaluate → hits[]  (compiled re2 rules × 3 variants + URL analysis)
                      └─ Stage 4  score    → HeatService.add(weight) per hit → currentHeat
                           └─ Stage 5  act      → deleteOnHit + (heat ≥ threshold ? thresholdAction)
```

Two consumers of the same rule/pack content:

1. **Runtime pipeline** (above) — source of truth; does everything.
2. **Native projection** — rule/pack entries that are expressible as native AutoMod (keyword / regex / mention / spam / preset) are projected onto the AutoModeration API through the existing `native/rules.js` reconciler, now fed from packs instead of hardcoded lists. Blocks at Discord's edge and keeps the badge. Confusables, heat, and edit-distance analysis stay runtime-only — native cannot express them.

### 4.1 Module layout

```
src/core/HeatService.js                     # NEW reusable core service

src/modules/automod/
  pipeline/
    index.js         # orchestrates stages 1–5 for one message
    extract.js       # Stage 1
    normalize.js     # Stage 2
    evaluate.js      # Stage 3 (runs compiled rules over variants)
    url.js           # Stage 3 URL analysis
    score.js         # Stage 4 (hits → heat)
    act.js           # Stage 5 (actions)
  confusables/
    data.js          # vendored generated skeleton map (build output)
    fold.js          # applies the skeleton map to a string
  rules/
    compile.js       # re2 compile + save-time sanity check
    cache.js         # per-guild compiled-rule cache + invalidation
    validate.js      # length/count caps + readable rejection errors
    packs/
      index.js       # pack registry (versioned, in code)
      nitro.js  steam.js  crypto.js  grabbers.js  raid.js
  feed/
    loader.js        # swappable scam-domain feed interface
    snapshot.js      # vendored seed blocklist snapshot
    refresh.js       # node-cron refresh job
  budget.js          # per-message time budget + per-rule self-heal
  native/            # EXISTING — reconciler kept, content source swapped to packs
  events/messageCreate.js   # rewritten to drive the pipeline
  commands/automod.js       # subcommands: panel|rules|test|packs|exempt|logs
  panel/                    # rebuilt dashboard

scripts/build-confusables.js  # NEW build script → confusables/data.js
```

## 5. Stage 1 — Extract

`extract(message, member) → { raw, embeds, filenames, stickerNames, displayName, urls }`

- `raw` = `message.content ?? ""`.
- `embeds` = joined title/description/field name+value/footer/author text across `message.embeds`.
- `filenames` = `message.attachments.map(a => a.name)`.
- `stickerNames` = `message.stickers.map(s => s.name)`.
- `displayName` = `member?.displayName ?? message.author.username`.
- `urls` = **structured**, not substrings. Tokenize the combined text on whitespace and Discord formatting boundaries; for each token attempt `new URL(token)`, and on failure retry `new URL("https://" + token)` to catch bare domains. Collect successful parses as `{ href, protocol, hostname, pathname }`. Invalid tokens are discarded. No URL regex.

The concatenation of `raw + embeds + filenames + stickerNames + displayName` is the text surface fed to Stage 2. `urls` is passed to Stage 3 URL analysis.

## 6. Stage 2 — Normalize (core value)

`normalize(text) → { raw, normalized, stripped }`

1. **NFKC** on the input.
2. **Strip zero-width**: `U+200B`–`U+200D`, `U+2060`, `U+FEFF`.
3. **NFD → strip combining marks (`\p{M}`) → NFC** recompose.
4. **Confusables skeleton fold**: map each code point through the vendored Unicode skeleton table (`confusables/data.js`), folding Cyrillic (`а о е р`), Greek lookalikes, fullwidth forms, etc. to canonical Latin. Full table generated from the official `confusables.txt` — never a hand-rolled partial.
5. **Lowercase**, **collapse runs** of the same character to a single instance.
6. `stripped` = the result of step 5 with all non-alphanumeric characters removed (defeats `d i s c o r d . g i f t`).

`raw` is the original untouched text (still matched, so patterns targeting literal punctuation/URLs work). `normalized` = output of step 5. `stripped` = step 6. Every rule is evaluated against the variants it targets; a hit on any counts.

**Confusables data:** `scripts/build-confusables.js` parses the official Unicode `confusables.txt` and emits a compact map to `confusables/data.js`, vendored into the repo. Re-run when Unicode updates. No runtime/supply-chain dependency.

**Test corpus (this stage is unit-tested in isolation):** cyrillic `discord`/`nitro`, fullwidth `ｄｉｓｃｏｒｄ`, zero-width-joined `disc​ord`, spaced `d i s c o r d . g i f t`, combining-mark stacks, repeat-run inflation (`freeeee niiitro`), mixed evasions.

## 7. Stage 3 — Evaluate

### 7.1 Rule engine — `re2`

User-supplied patterns compiled with Node's `RegExp` are a remote DoS: catastrophic backtracking blocks the shard's event loop with no timeout option. We use the **`re2`** package (linear time, no backtracking, structurally immune). Cost: no backreferences, no lookahead/lookbehind — acceptable, and **documented in `/automod` help text and the README**.

Guardrails (engine-independent):

- **Compile at rule-save time** (`rules/compile.js`), cache compiled objects per guild (`rules/cache.js`), invalidate on edit. Never compile per message.
- **Caps** (`rules/validate.js`): pattern length ≤ **200 chars**; ≤ **50 custom rules per guild** (free tier).
- **Per-message time budget** (`budget.js`): per-rule soft budget **5 ms**, per-message total **25 ms**. A rule that exceeds its per-rule budget is **auto-disabled** (`enabled=false`, `disabledReason` persisted), logged, and reported to the alert channel. Self-healing beats a hung shard. (With re2 this is a safety net, not an expected path.)
- **Save-time sanity check**: reject patterns that fail to compile, are empty, or match the empty string / everything (e.g. `.*`, `.+`, `(.*)`), with a readable error.

### 7.2 Rule evaluation

Each `AutomodRule` = `{ pattern, target, weight, deleteOnHit, dryRun, enabled }`. `target ∈ {raw, normalized, stripped, any}`. Evaluate the compiled rule against the targeted variant(s); collect a hit `{ source, weight, deleteOnHit, dryRun }` per match. Built-in pack rules and custom rules share this shape.

### 7.3 URL analysis (`pipeline/url.js`)

For each structured URL from Stage 1:

- **Punycode**: decode `xn--` labels; **flag mixed-script** hostnames (labels containing code points from more than one Unicode script).
- **Edit distance**: Levenshtein of the registrable hostname vs an impersonation-target list (`discord.com`, `discord.gift`, `discordapp.com`, `steamcommunity.com`, `steampowered.com`, …). Distance 1–2 (but not 0) → impersonation hit.
- **Blocklist**: exact/suffix match against the in-memory scam-domain set (from the feed).
- **Shortener**: known shortener host → suspicion hit. **No outbound request is made.**

Each check yields a weighted hit like any rule hit.

## 8. Stage 4 — Score (`HeatService` + `pipeline/score.js`)

### 8.1 `src/core/HeatService.js`

In-memory decaying accumulator, generic and reusable.

- State: `Map<"guildId:userId", { value, lastTs }>`.
- `add(guildId, userId, amount, halfLifeMs) → number` — decays existing value by `value * 0.5 ** ((now - lastTs)/halfLifeMs)`, adds `amount`, stores, returns new value.
- `get(guildId, userId, halfLifeMs) → number` — decayed read without mutation.
- `reset(guildId, userId)`.
- Periodic **sweep** removing entries whose decayed value is ~0, to bound memory.
- `halfLifeMs` is passed per call (mirrors `WindowTracker(windowMs)`), so config lives in the caller and the service stays generic for anti-nuke / join gate reuse.

### 8.2 Scoring

For each non-dry-run hit, `score.js` calls `HeatService.add(guildId, userId, hit.weight, heatDecaySec*1000)` and tracks the running total. Dry-run hits contribute nothing (see Stage 5).

## 9. Stage 5 — Act (`pipeline/act.js`)

Resolves the brief's heat-vs-action tension with two tiers:

- **Content action (per rule):** `deleteOnHit` deletes the triggering message. Removing content is not "punishing the user"; native AutoMod already blocks at the edge for projected rules.
- **Member action (heat-driven):** when cumulative heat ≥ `heatThreshold`, fire `thresholdAction ∈ {warn, timeout, kick, ban, quarantine}` once, using existing primitives:
  - `warn` → `cases.createCase({type:"warn"})`
  - `timeout` → `member.timeout(sec*1000)` + case
  - `kick` → `member.kick()` + case
  - `ban` → `guild.bans.create()` + case
  - `quarantine` → `member.roles.set([quarantineRoleId])` + case (mirrors `antinuke/punish.js`)
  - `log-only` is expressible as a rule-level state, not a threshold action.
- **Dry-run (`dryRun`, mandatory per rule):** short-circuits — no heat, no delete, no member action. Writes an `AutomodLog` row with `dryRun=true` recording what it *would* have caught. This is how an admin trials a rule against live traffic.
- **DM offender** on member action when `dmOnAction` is set (existing behavior).
- **Every hit** (including dry-run) is written to `AutomodLog` and, when a member action fires or a rule self-disables, reported to the alert channel.

**Exemptions (preserved exactly):** `ManageMessages` holders, `exemptRoles`, `exemptChannels` — checked before the pipeline runs; exempt messages skip it entirely.

## 10. Rule packs

Curated, versioned packs defined in code under `rules/packs/`: **Nitro scams, Steam gift scams, crypto/airdrop, IP grabbers/loggers, raid advertising** (plus a built-in **Core** pack backfilled from the legacy filters). Each pack has:

- `id`, `version` (integer), `title`, `description`.
- `rules[]`: each with `pattern`, `target`, `weight`, `deleteOnHit`, and an optional **native projection** (`{ keywordFilter?, regexPatterns?, triggerType }`) telling the reconciler how to express it as a Discord AutoMod rule.

Per-guild `AutomodPackState { enabled, installedVersion }`. Updates propagate by comparing `installedVersion` to the pack's current `version`; the panel surfaces "update available" and applies the new content on toggle/update.

**Scam-domain feed** (`feed/`): a **vendored snapshot** (`snapshot.js`) plus a **swappable loader** (`loader.js`) refreshed by a **node-cron job** (`refresh.js`) from a feed URL in env. On fetch failure or when refresh is disabled, the loader falls back to the vendored snapshot. The blocklist is held in memory. Swapping the source or refreshing needs no deploy.

## 11. Data model (Prisma)

- **`AutomodConfig`** (extend): add `heatThreshold Int`, `heatDecaySec Int`, `thresholdAction String`. Keep `exemptRoles`, `exemptChannels`, all `native*` columns. **Migration backfills** the six legacy filter booleans into built-in Core pack state, then those columns (`antiSpam`, `spamCount`, `spamWindowSec`, `antiMentionSpam`, `mentionLimit`, `filterInvites`, `filterLinks`, `antiCaps`, `capsPercent`, `capsMinLength`, `antiEmojiSpam`, `emojiLimit`, `action`, `timeoutSeconds`) are dropped.
- **`AutomodRule`** (new): `id, guildId, source, pattern, target, weight, deleteOnHit, dryRun, enabled, disabledReason, createdAt`. Indexed by `guildId`.
- **`AutomodPackState`** (new): `guildId, packId, enabled, installedVersion` — PK `(guildId, packId)`.
- **`AutomodLog`** (new): `id, guildId, userId, channelId, source, action, dryRun, heatAfter, sample, createdAt`. Indexed by `guildId, createdAt`.

`ConfigService` gains `updateAutomodRule*` / `getAutomodRules` / pack-state helpers following the existing cache-invalidation pattern.

## 12. Command surface (`/automod`, Administrator)

- `panel` — rebuilt button dashboard: enable toggle, pack toggles (with version/update indicator), `heatThreshold` + `thresholdAction`, exemptions, native sync, logs shortcut. Uses the shared `runPanel` loop and `am:*` customIds.
- `rules add | remove | list | edit` — manage custom re2 rules (the escape hatch). `add`/`edit` validate + compile at save; readable error on rejection.
- `test <rule> <sample text>` — runs the sample through the full normalize pipeline and the chosen rule, showing which variant matched, the heat it would add, and the resulting action. Trust feature.
- `packs` — enable/disable packs, show installed-vs-current version, update.
- `exempt` — unchanged (roles/channels).
- `logs` — recent hits including dry-run.

## 13. Error handling

- re2 compile / sanity failure at save → reject with a readable message; nothing persisted.
- Per-message budget exceeded by a rule → auto-disable, persist `disabledReason`, log, alert.
- Native sync failures → existing summary-based handling in `native/rules.js` (unchanged).
- Feed refresh failure → keep last-good in-memory list / vendored snapshot; log.
- All Discord side-effects (`delete`, `timeout`, `kick`, `ban`, `roles.set`, DM) wrapped in try/catch with logging (existing pattern in `action.js`).

## 14. Testing

Isolated unit suites (vitest, colocated under `test/modules/automod/` and `test/core/`):

- **`normalize`** — the evasion corpus (§6). Highest priority.
- **confusables fold** — representative homoglyph → Latin mappings.
- **extract** — URL parsing (bare domains, invalid tokens), embeds, filenames, sticker names, display name.
- **url analysis** — punycode decode, mixed-script flag, edit-distance banding, blocklist suffix match, shortener flag.
- **`HeatService`** — decay math, threshold crossing, reset, sweep.
- **compile / validate** — re2 compile, empty/`.*` rejection, length cap, per-guild count cap.
- **budget** — a slow rule auto-disables and is reported.
- **act** — each action path, exemption short-circuit, dry-run short-circuit (no heat/no delete/log written).
- **packs** — version comparison / update propagation.
- **feed loader** — swappable source + snapshot fallback.
- **command + panel** — following existing `automodCommand` / `panelHandlers` / `panelRender` test conventions.

## 15. Risks

- **`re2` is a native addon.** The target runtime is a Pterodactyl egg on Node 22; it must support `re2`'s prebuilt binaries or provide build tooling (`node-gyp`, Python, a compiler). The compile layer is abstracted behind `rules/compile.js`, so an alternative linear-time matcher could slot in if `re2` cannot build in the target environment — but the plan targets `re2` as specified. **Verify `re2` installs and loads in the deploy image before shipping.**
- **Migration is destructive** (drops legacy columns). The migration must backfill Core pack state from existing values first; it is written and reviewed as a single reversible-in-intent step, and tested against a seeded DB.
- **Confusables table size** — the vendored `data.js` is a few hundred KB; acceptable, loaded once at boot.

## 16. Migration & rollout

1. Add `re2` dependency; verify install/load in deploy image.
2. Prisma migration: add new models + `AutomodConfig` columns, backfill Core pack state, drop legacy columns.
3. Build and vendor `confusables/data.js`.
4. Implement pipeline stages bottom-up (normalize first, per the brief), each with its unit suite, before wiring `messageCreate`.
5. Re-point `native/rules.js` content at packs; verify native sync still reconciles correctly (badge preserved).
6. Rebuild command surface + panel.
7. README + `/automod` help updates (re2 limitations, packs, dry-run).
