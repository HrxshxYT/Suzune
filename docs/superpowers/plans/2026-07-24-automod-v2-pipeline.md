# AutoMod v2 Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the automod module's fixed-filter matcher with an `extract → normalize → evaluate → score → act` pipeline plus a reusable in-memory `HeatService`, keeping native Discord AutoMod provisioning intact.

**Architecture:** Pure, independently-tested pipeline stages under `src/modules/automod/pipeline/` feed a per-guild-per-user decaying heat accumulator (`src/core/HeatService.js`). Rules come from versioned in-code packs (`rules/packs/`) plus a user re2 escape hatch, compiled once at save-time and cached per guild. The same pack content is projected onto the existing `native/rules.js` AutoModeration reconciler. `messageCreate` orchestrates the stages; a rebuilt `/automod` command surface manages it.

**Tech Stack:** Node 22 (ESM), discord.js 14, Prisma 6, vitest, `re2` (new native dep), node-cron, Unicode `confusables.txt`.

## Global Constraints

- Node `>=22.12.0`, ESM (`"type": "module"`), 2-space indent, Prettier defaults (see `.prettierrc.json`).
- Regex engine for **user/pack patterns** is `re2` ONLY — never Node `RegExp` for guild-supplied input. No backreferences, no lookahead/lookbehind (document in `/automod` help + README). Internal fixed regexes in our own source may use `RegExp`.
- Pattern length cap: **200 chars**. Custom rules per guild cap: **50**.
- Per-rule eval budget: **5 ms**; per-message total budget: **25 ms**. A rule exceeding its per-rule budget is auto-disabled (persist `disabledReason`), logged, and reported to the alert channel.
- Compile patterns at save-time, cache per guild, invalidate on edit. Never compile per message.
- No outbound network to follow URL shorteners this pass.
- Heat is in-memory and ephemeral; `halfLifeMs` is passed per call (mirrors `WindowTracker(windowMs)`).
- Preserve exemptions exactly: `ManageMessages` holders, `exemptRoles`, `exemptChannels`.
- Preserve native AutoMod provisioning (`RULE_PREFIX = "Suzune • "`, singleton/adopt logic).
- Follow existing patterns: `ctx.config.updateAutomod`, `runPanel`, `am:*` customIds, colocated vitest tests under `test/`.
- Spec: `docs/superpowers/specs/2026-07-24-automod-v2-pipeline-design.md`.

---

## File Structure

```
src/core/HeatService.js                          # Task 8
src/modules/automod/
  confusables/data.js                            # Task 2 (generated, vendored)
  confusables/fold.js                            # Task 4
  pipeline/normalize.js                          # Task 5
  pipeline/extract.js                            # Task 6
  pipeline/url.js                                # Task 7
  pipeline/evaluate.js                           # Task 14
  pipeline/score.js                              # Task 15
  pipeline/act.js                                # Task 16
  pipeline/index.js                              # Task 17
  rules/validate.js                              # Task 9
  rules/compile.js                               # Task 9
  rules/cache.js                                 # Task 10
  rules/packs/index.js                           # Task 11
  rules/packs/{core,nitro,steam,crypto,grabbers,raid}.js  # Task 11
  feed/loader.js  feed/snapshot.js  feed/refresh.js       # Task 12
  budget.js                                      # Task 13
  native/rules.js                                # Task 20 (modify: content from packs)
  events/messageCreate.js                        # Task 19 (rewrite)
  commands/automod.js                            # Task 22 (rewrite: subcommands)
  panel/{index,render,handlers}.js               # Task 26 (rebuild)
  statusEmbed.js                                 # Task 26 (update)
scripts/build-confusables.js                     # Task 2
prisma/schema.prisma + migration                 # Task 3
src/core/ConfigService.js                        # Task 18 (add helpers)
src/bot.js                                       # Task 17/21 (wire HeatService + feed cron)
README.md                                        # Task 27
```

---

## Task 1: Add and verify the `re2` dependency

**Files:**
- Modify: `package.json`
- Test: `test/modules/automod/re2Smoke.test.js`

**Interfaces:**
- Produces: `re2` importable as `import RE2 from "re2";`

- [ ] **Step 1: Add the dependency**

Run: `npm install re2@^1.21.0`
Expected: installs with a prebuilt binary; `node -e "console.log(require('re2'))"` prints a function.

- [ ] **Step 2: Write the smoke test**

```js
// test/modules/automod/re2Smoke.test.js
import { describe, it, expect } from "vitest";
import RE2 from "re2";

describe("re2", () => {
  it("compiles and matches linearly", () => {
    const re = new RE2("disc(o|0)rd", "i");
    expect(re.test("DISC0RD")).toBe(true);
    expect(re.test("hello")).toBe(false);
  });
  it("rejects lookahead (documents the limitation)", () => {
    expect(() => new RE2("foo(?=bar)")).toThrow();
  });
});
```

- [ ] **Step 3: Run test** — `npx vitest run test/modules/automod/re2Smoke.test.js` — Expected: PASS. If install failed (no build toolchain in this environment), STOP and report per spec §15 before proceeding.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json test/modules/automod/re2Smoke.test.js
git commit -m "build(automod): add re2 dependency + load smoke test"
```

---

## Task 2: Confusables build script + vendored data

**Files:**
- Create: `scripts/build-confusables.js`
- Create: `src/modules/automod/confusables/data.js` (generated output, committed)
- Create: `test/scripts/buildConfusables.test.js`

**Interfaces:**
- Produces: `data.js` default-exports `CONFUSABLES: Map<string,string>` (single source char → canonical target string).

- [ ] **Step 1: Write the parser test** (drives the line-parsing helper, which we export for testability)

```js
// test/scripts/buildConfusables.test.js
import { describe, it, expect } from "vitest";
import { parseConfusablesLine, buildMap } from "../../scripts/build-confusables.js";

describe("build-confusables parser", () => {
  it("parses a single-source mapping line", () => {
    // "0430 ; 0061 ; MA  # ( а → a )"
    const row = parseConfusablesLine("0430 ; 0061 ; MA\t#\t( а → a )");
    expect(row).toEqual({ source: "а", target: "a" });
  });
  it("skips comments and blank lines", () => {
    expect(parseConfusablesLine("# comment")).toBeNull();
    expect(parseConfusablesLine("")).toBeNull();
  });
  it("skips multi-codepoint sources (out of scope)", () => {
    expect(parseConfusablesLine("00DF ; 0073 0073 ; MA")).toEqual({
      source: "ß",
      target: "ss",
    });
  });
  it("buildMap dedupes to a Map", () => {
    const map = buildMap(["0430 ; 0061 ; MA", "0435 ; 0065 ; MA"]);
    expect(map.get("а")).toBe("a");
    expect(map.get("е")).toBe("e");
  });
});
```

- [ ] **Step 2: Run test** — `npx vitest run test/scripts/buildConfusables.test.js` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement the build script**

```js
// scripts/build-confusables.js
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const cp = (hex) => String.fromCodePoint(parseInt(hex, 16));

// One data line: "SRC ; TGT1 TGT2 ; MA # comment". We keep only single-codepoint
// sources (the common homoglyph case); multi-codepoint sources are rare and
// out of scope for the skeleton fold we need.
export function parseConfusablesLine(line) {
  const noComment = line.split("#")[0].trim();
  if (!noComment) return null;
  const parts = noComment.split(";").map((p) => p.trim());
  if (parts.length < 2) return null;
  const srcCps = parts[0].split(/\s+/).filter(Boolean);
  if (srcCps.length !== 1) return null;
  const tgtCps = parts[1].split(/\s+/).filter(Boolean);
  if (tgtCps.length === 0) return null;
  return { source: cp(srcCps[0]), target: tgtCps.map(cp).join("") };
}

export function buildMap(lines) {
  const map = new Map();
  for (const line of lines) {
    const row = parseConfusablesLine(line);
    if (row) map.set(row.source, row.target);
  }
  return map;
}

// CLI: node scripts/build-confusables.js <path-to-confusables.txt>
if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) throw new Error("usage: build-confusables.js <confusables.txt>");
  const lines = readFileSync(src, "utf8").split(/\r?\n/);
  const map = buildMap(lines);
  const entries = [...map.entries()]
    .map(([s, t]) => `[${JSON.stringify(s)},${JSON.stringify(t)}]`)
    .join(",\n");
  const out = `// GENERATED by scripts/build-confusables.js from Unicode confusables.txt.\n// Do not edit by hand; re-run the script when Unicode updates.\nexport const CONFUSABLES = new Map([\n${entries}\n]);\nexport default CONFUSABLES;\n`;
  const dest = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "modules",
    "automod",
    "confusables",
    "data.js",
  );
  writeFileSync(dest, out);
  console.log(`wrote ${map.size} mappings to ${dest}`);
}
```

- [ ] **Step 4: Run test** — `npx vitest run test/scripts/buildConfusables.test.js` — Expected: PASS.

- [ ] **Step 5: Generate the vendored data**

Download the official file and generate:
```bash
curl -fsSL https://www.unicode.org/Public/security/latest/confusables.txt -o /tmp/confusables.txt
node scripts/build-confusables.js /tmp/confusables.txt
```
Expected: `wrote <N> mappings to .../confusables/data.js` (N in the thousands). Verify quickly:
```bash
node -e "import('./src/modules/automod/confusables/data.js').then(m=>console.log(m.CONFUSABLES.get('а')))"
```
Expected: prints `a`.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-confusables.js src/modules/automod/confusables/data.js test/scripts/buildConfusables.test.js
git commit -m "feat(automod): vendor Unicode confusables skeleton map + build script"
```

---

## Task 3: Prisma schema — new models, config columns, backfill migration

**Files:**
- Modify: `prisma/schema.prisma` (`AutomodConfig`, + 3 new models)
- Create: migration under `prisma/migrations/`
- Test: `test/modules/automod/schema.test.js`

**Interfaces:**
- Produces: Prisma models `AutomodRule`, `AutomodPackState`, `AutomodLog`; `AutomodConfig` gains `heatThreshold Int @default(100)`, `heatDecaySec Int @default(60)`, `thresholdAction String @default("timeout")`.

- [ ] **Step 1: Edit `AutomodConfig`** — remove the legacy filter columns and add the heat columns. Replace lines `145-160` (the `antiSpam … timeoutSeconds` block, keeping `guildId`, `guild`, `enabled`, `exemptRoles`, `exemptChannels`, and all `native*` columns) so the model reads:

```prisma
model AutomodConfig {
  guildId         String  @id
  guild           Guild   @relation(fields: [guildId], references: [id], onDelete: Cascade)
  enabled         Boolean @default(false)

  // Heat-based scoring (replaces the legacy fixed filters + single action).
  heatThreshold   Int     @default(100)
  heatDecaySec    Int     @default(60)
  thresholdAction String  @default("timeout") // warn|timeout|kick|ban|quarantine

  exemptRoles     Json    @default("[]")
  exemptChannels  Json    @default("[]")

  // Native Discord AutoMod (unchanged) ...
  nativeEnabled        Boolean @default(false)
  nativeInvites        Boolean @default(true)
  nativeScamLinks      Boolean @default(true)
  nativeGrabbers       Boolean @default(true)
  nativeNitroScams     Boolean @default(true)
  nativeCryptoScams    Boolean @default(true)
  nativeAdSpam         Boolean @default(true)
  nativeMentions       Boolean @default(true)
  nativeSpam           Boolean @default(true)
  nativePresets        Boolean @default(true)
  nativeAlert          Boolean @default(true)
  nativeAlertChannelId String?
  nativeTimeout        Boolean @default(true)
  nativeTimeoutSeconds Int     @default(300)

  rules      AutomodRule[]
  packStates AutomodPackState[]
}
```

- [ ] **Step 2: Add the three new models** (after `AutomodConfig`)

```prisma
model AutomodRule {
  id             String  @id @default(cuid())
  guildId        String
  config         AutomodConfig @relation(fields: [guildId], references: [guildId], onDelete: Cascade)
  source         String  // packId or "custom"
  pattern        String
  target         String  @default("any") // raw|normalized|stripped|any
  weight         Int     @default(20)
  deleteOnHit    Boolean @default(true)
  dryRun         Boolean @default(false)
  enabled        Boolean @default(true)
  disabledReason String?
  createdAt      DateTime @default(now())

  @@index([guildId])
}

model AutomodPackState {
  guildId          String
  config           AutomodConfig @relation(fields: [guildId], references: [guildId], onDelete: Cascade)
  packId           String
  enabled          Boolean @default(false)
  installedVersion Int     @default(0)

  @@id([guildId, packId])
}

model AutomodLog {
  id        String   @id @default(cuid())
  guildId   String
  userId    String
  channelId String
  source    String
  action    String
  dryRun    Boolean  @default(false)
  heatAfter Int      @default(0)
  sample    String
  createdAt DateTime @default(now())

  @@index([guildId, createdAt])
}
```

- [ ] **Step 3: Create the migration with a backfill** — generate a draft, then edit the SQL to backfill Core pack state before dropping columns:

```bash
npx prisma migrate dev --name automod_v2 --create-only
```
Then edit the generated `migration.sql` so that BEFORE the `ALTER TABLE ... DROP COLUMN` statements it inserts Core pack state derived from the old flags (SQLite dialect shown; match your provider):

```sql
-- Backfill: enable the built-in Core pack for guilds that had any legacy filter on.
INSERT INTO "AutomodPackState" ("guildId", "packId", "enabled", "installedVersion")
SELECT "guildId", 'core', 1, 0 FROM "AutomodConfig"
WHERE "antiSpam" = 1 OR "antiMentionSpam" = 1 OR "filterInvites" = 1
   OR "filterLinks" = 1 OR "antiCaps" = 1 OR "antiEmojiSpam" = 1;

-- Carry the old single action forward as the heat threshold action where sensible.
UPDATE "AutomodConfig" SET "thresholdAction" =
  CASE WHEN "action" = 'timeout' THEN 'timeout' WHEN "action" = 'warn' THEN 'warn' ELSE 'timeout' END;
```
(The Prisma-generated DROP COLUMN / table-rebuild statements for the legacy columns follow.)

- [ ] **Step 4: Apply and generate** — `npx prisma migrate dev --name automod_v2` then `npx prisma generate` — Expected: applies cleanly, client regenerates.

- [ ] **Step 5: Write a schema smoke test**

```js
// test/modules/automod/schema.test.js
import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";

describe("automod v2 schema", () => {
  it("exposes the new models and columns", () => {
    const p = new PrismaClient();
    expect(p.automodRule).toBeDefined();
    expect(p.automodPackState).toBeDefined();
    expect(p.automodLog).toBeDefined();
    // Legacy columns are gone from the generated types (compile-time guarantee);
    // here we just assert the client constructed.
    expect(p.automodConfig).toBeDefined();
  });
});
```

- [ ] **Step 6: Run test** — `npx vitest run test/modules/automod/schema.test.js` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/modules/automod/schema.test.js
git commit -m "feat(automod): v2 Prisma schema (rules, pack state, logs) + backfill migration"
```

---

## Task 4: Confusables fold

**Files:**
- Create: `src/modules/automod/confusables/fold.js`
- Test: `test/modules/automod/confusablesFold.test.js`

**Interfaces:**
- Consumes: `CONFUSABLES` from `confusables/data.js`.
- Produces: `fold(text: string): string`.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/confusablesFold.test.js
import { describe, it, expect } from "vitest";
import { fold } from "../../../src/modules/automod/confusables/fold.js";

describe("fold", () => {
  it("maps Cyrillic homoglyphs to Latin", () => {
    // а о е р are Cyrillic here
    expect(fold("dата")).toContain("a"); // best-effort per table
  });
  it("passes plain ASCII through unchanged", () => {
    expect(fold("discord")).toBe("discord");
  });
  it("handles empty and returns a string", () => {
    expect(fold("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test** — `npx vitest run test/modules/automod/confusablesFold.test.js` — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/confusables/fold.js
import { CONFUSABLES } from "./data.js";

// Map each code point through the Unicode skeleton table, folding homoglyphs to
// their canonical form. Iterating by code point (spread) handles astral chars.
export function fold(text) {
  let out = "";
  for (const ch of text ?? "") out += CONFUSABLES.get(ch) ?? ch;
  return out;
}
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(automod): confusables skeleton fold"`

---

## Task 5: Normalize (core stage)

**Files:**
- Create: `src/modules/automod/pipeline/normalize.js`
- Test: `test/modules/automod/normalize.test.js`

**Interfaces:**
- Consumes: `fold` from `confusables/fold.js`.
- Produces: `normalize(text: string): { raw: string, normalized: string, stripped: string }`.

Concrete interpretation of "collapse runs": collapse runs of **3+ identical chars to 2** (keeps legitimate doubles like `free`; caps `niiiitro`→`niitro`). Pack patterns use `+` quantifiers for stretched letters where needed.

- [ ] **Step 1: Write the evasion-corpus test**

```js
// test/modules/automod/normalize.test.js
import { describe, it, expect } from "vitest";
import { normalize } from "../../../src/modules/automod/pipeline/normalize.js";

describe("normalize", () => {
  it("returns raw untouched", () => {
    expect(normalize("Hello.World").raw).toBe("Hello.World");
  });
  it("folds Cyrillic 'discord' to latin in normalized", () => {
    const cyr = "diѕcоxtitle"; // с о cyrillic (illustrative)
    expect(normalize(cyr).normalized).toContain("disc");
  });
  it("strips zero-width joiners", () => {
    expect(normalize("disc​ord").normalized).toBe("discord");
  });
  it("strips combining marks", () => {
    // 'e' + combining acute
    expect(normalize("café").normalized).toBe("cafe");
  });
  it("NFKC folds fullwidth", () => {
    expect(normalize("ｄｉｓ").normalized).toBe("dis");
  });
  it("collapses 3+ runs to 2 but keeps doubles", () => {
    expect(normalize("niiiitro").normalized).toBe("niitro");
    expect(normalize("free").normalized).toBe("free");
  });
  it("stripped variant defeats spaced-out text", () => {
    expect(normalize("d i s c o r d . g i f t").stripped).toBe("discordgift");
  });
  it("lowercases", () => {
    expect(normalize("DISCORD").normalized).toBe("discord");
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/pipeline/normalize.js
import { fold } from "../confusables/fold.js";

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const COMBINING = /\p{M}+/gu;
const RUN_3PLUS = /(.)\1{2,}/gus; // 3+ identical → keep 2
const NON_ALNUM = /[^a-z0-9]+/gu;

export function normalize(text) {
  const raw = text ?? "";
  let s = raw.normalize("NFKC").replace(ZERO_WIDTH, "");
  s = s.normalize("NFD").replace(COMBINING, "").normalize("NFC");
  s = fold(s);
  s = s.toLowerCase().replace(RUN_3PLUS, "$1$1");
  const normalized = s;
  const stripped = s.replace(NON_ALNUM, "");
  return { raw, normalized, stripped };
}
```

- [ ] **Step 4: Run test** — Expected: PASS. (If a Cyrillic assertion is off, adjust the *test sample* to match the vendored table, not the algorithm.)

- [ ] **Step 5: Commit** — `git commit -am "feat(automod): stage 2 normalize with evasion corpus"`

---

## Task 6: Extract (stage 1)

**Files:**
- Create: `src/modules/automod/pipeline/extract.js`
- Test: `test/modules/automod/extract.test.js`

**Interfaces:**
- Produces: `extract(message, member): { text: string, urls: Array<{href,protocol,hostname,pathname}> }` where `text` is the combined surface (`raw + embeds + filenames + stickerNames + displayName`).

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/extract.test.js
import { describe, it, expect } from "vitest";
import { extract } from "../../../src/modules/automod/pipeline/extract.js";

const fakeMessage = (over = {}) => ({
  content: "check https://discord.gift/free and bit.ly/x",
  embeds: [{ title: "Free Nitro", description: "click here", fields: [], footer: null, author: null }],
  attachments: new Map([["1", { name: "invoice.exe" }]]),
  stickers: new Map([["2", { name: "wave" }]]),
  author: { username: "scammer" },
  ...over,
});

describe("extract", () => {
  it("combines all text surfaces", () => {
    const { text } = extract(fakeMessage(), { displayName: "Nitro Giver" });
    expect(text).toContain("Free Nitro");
    expect(text).toContain("invoice.exe");
    expect(text).toContain("wave");
    expect(text).toContain("Nitro Giver");
  });
  it("parses full URLs structurally", () => {
    const { urls } = extract(fakeMessage(), null);
    expect(urls.some((u) => u.hostname === "discord.gift")).toBe(true);
  });
  it("parses bare domains via https retry", () => {
    const { urls } = extract(fakeMessage(), null);
    expect(urls.some((u) => u.hostname === "bit.ly")).toBe(true);
  });
  it("discards non-URL tokens", () => {
    const { urls } = extract({ ...fakeMessage(), content: "just words here" }, null);
    expect(urls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/pipeline/extract.js
function embedText(embeds = []) {
  const parts = [];
  for (const e of embeds) {
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    if (e.author?.name) parts.push(e.author.name);
    if (e.footer?.text) parts.push(e.footer.text);
    for (const f of e.fields ?? []) parts.push(f.name, f.value);
  }
  return parts.filter(Boolean).join(" ");
}

const values = (mapLike) =>
  mapLike?.values ? [...mapLike.values()] : Array.isArray(mapLike) ? mapLike : [];

// Parse URLs as structured data: tokenize on whitespace, attempt `new URL`,
// retrying with an https:// prefix to catch bare domains. Never regex-scan.
function parseUrls(text) {
  const out = [];
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    let u = null;
    try {
      u = new URL(token);
    } catch {
      if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(token)) {
        try {
          u = new URL(`https://${token}`);
        } catch {
          u = null;
        }
      }
    }
    if (u && (u.protocol === "http:" || u.protocol === "https:")) {
      out.push({ href: u.href, protocol: u.protocol, hostname: u.hostname, pathname: u.pathname });
    }
  }
  return out;
}

export function extract(message, member) {
  const raw = message.content ?? "";
  const filenames = values(message.attachments).map((a) => a.name).join(" ");
  const stickerNames = values(message.stickers).map((s) => s.name).join(" ");
  const displayName = member?.displayName ?? message.author?.username ?? "";
  const text = [raw, embedText(message.embeds), filenames, stickerNames, displayName]
    .filter(Boolean)
    .join(" ");
  return { text, urls: parseUrls(raw) };
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): stage 1 extract (surfaces + structured URLs)"`

---

## Task 7: URL analysis

**Files:**
- Create: `src/modules/automod/pipeline/url.js`
- Test: `test/modules/automod/url.test.js`

**Interfaces:**
- Produces: `analyzeUrls(urls, { blocklist: Set<string>, targets?: string[], shorteners?: Set<string> }): Array<{ kind, host, weight }>` where `kind ∈ {blocklist, impersonation, mixed-script, shortener}`.
- Exports helper `levenshtein(a,b): number` (tested directly).

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/url.test.js
import { describe, it, expect } from "vitest";
import { analyzeUrls, levenshtein } from "../../../src/modules/automod/pipeline/url.js";

const u = (hostname) => ({ hostname, href: `https://${hostname}/`, protocol: "https:", pathname: "/" });

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("discord.com", "discord.com")).toBe(1);
    expect(levenshtein("abc", "abc")).toBe(0);
  });
});

describe("analyzeUrls", () => {
  const blocklist = new Set(["evil-scam.example"]);
  const shorteners = new Set(["bit.ly"]);
  it("flags blocklist hits (suffix match)", () => {
    const r = analyzeUrls([u("sub.evil-scam.example")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "blocklist")).toBe(true);
  });
  it("flags impersonation via edit distance 1-2", () => {
    const r = analyzeUrls([u("discord.com")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "impersonation")).toBe(true);
  });
  it("does not flag the exact target", () => {
    const r = analyzeUrls([u("discord.com")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "impersonation")).toBe(false);
  });
  it("flags known shorteners", () => {
    const r = analyzeUrls([u("bit.ly")], { blocklist, shorteners });
    expect(r.some((x) => x.kind === "shortener")).toBe(true);
  });
  it("flags mixed-script hostnames", () => {
    const r = analyzeUrls([u("xn--dscord-3we.com")], { blocklist, shorteners }); // punycode w/ cyrillic
    expect(r.some((x) => x.kind === "mixed-script")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/pipeline/url.js
import { domainToUnicode } from "node:url";

export const DEFAULT_TARGETS = [
  "discord.com",
  "discord.gg",
  "discord.gift",
  "discordapp.com",
  "steamcommunity.com",
  "steampowered.com",
];

const WEIGHTS = { blocklist: 80, impersonation: 60, "mixed-script": 50, shortener: 25 };

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[m][n];
}

// Registrable-ish domain: last two labels. Good enough for impersonation checks.
function registrable(host) {
  const labels = host.split(".");
  return labels.slice(-2).join(".");
}

function isMixedScript(host) {
  const unicode = domainToUnicode(host);
  const scripts = new Set();
  for (const ch of unicode) {
    if (/\p{Script=Latin}/u.test(ch)) scripts.add("Latin");
    else if (/\p{Script=Cyrillic}/u.test(ch)) scripts.add("Cyrillic");
    else if (/\p{Script=Greek}/u.test(ch)) scripts.add("Greek");
  }
  return scripts.size > 1;
}

export function analyzeUrls(urls, { blocklist, targets = DEFAULT_TARGETS, shorteners }) {
  const hits = [];
  const seen = new Set();
  for (const { hostname } of urls) {
    if (!hostname || seen.has(hostname)) continue;
    seen.add(hostname);
    const host = hostname.toLowerCase();
    const reg = registrable(host);

    // blocklist: exact or subdomain suffix
    for (const bad of blocklist) {
      if (host === bad || host.endsWith(`.${bad}`)) {
        hits.push({ kind: "blocklist", host, weight: WEIGHTS.blocklist });
        break;
      }
    }
    if (shorteners?.has(host) || shorteners?.has(reg))
      hits.push({ kind: "shortener", host, weight: WEIGHTS.shortener });
    if (isMixedScript(host))
      hits.push({ kind: "mixed-script", host, weight: WEIGHTS["mixed-script"] });
    for (const t of targets) {
      const d = levenshtein(reg, t);
      if (d >= 1 && d <= 2) {
        hits.push({ kind: "impersonation", host, weight: WEIGHTS.impersonation });
        break;
      }
    }
  }
  return hits;
}
```

- [ ] **Step 4: Run test** — Expected: PASS. (If the punycode sample doesn't decode to mixed-script on your Node build, replace it with a known xn-- label that decodes to Cyrillic+Latin.)
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): stage 3 URL analysis (punycode, edit-distance, blocklist, shorteners)"`

---

## Task 8: HeatService (core)

**Files:**
- Create: `src/core/HeatService.js`
- Test: `test/core/HeatService.test.js`

**Interfaces:**
- Produces: `class HeatService` with `add(guildId,userId,amount,halfLifeMs): number`, `get(guildId,userId,halfLifeMs): number`, `reset(guildId,userId): void`, `sweep(halfLifeMs, epsilon?): void`. Constructor takes injectable `now = () => Date.now()`.

- [ ] **Step 1: Write the test**

```js
// test/core/HeatService.test.js
import { describe, it, expect } from "vitest";
import { HeatService } from "../../src/core/HeatService.js";

describe("HeatService", () => {
  it("accumulates heat", () => {
    let t = 0;
    const h = new HeatService(() => t);
    expect(h.add("g", "u", 30, 60000)).toBe(30);
    expect(h.add("g", "u", 40, 60000)).toBe(70);
  });
  it("decays by half over one half-life", () => {
    let t = 0;
    const h = new HeatService(() => t);
    h.add("g", "u", 100, 60000);
    t = 60000;
    expect(h.get("g", "u", 60000)).toBeCloseTo(50, 5);
  });
  it("reset clears", () => {
    let t = 0;
    const h = new HeatService(() => t);
    h.add("g", "u", 100, 60000);
    h.reset("g", "u");
    expect(h.get("g", "u", 60000)).toBe(0);
  });
  it("sweep drops near-zero entries", () => {
    let t = 0;
    const h = new HeatService(() => t);
    h.add("g", "u", 100, 60000);
    t = 600000; // 10 half-lives → ~0.098
    h.sweep(60000, 0.5);
    expect(h.get("g", "u", 60000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/core/HeatService.js
// In-memory decaying heat accumulator, keyed per guild+user. Generic: the
// half-life is supplied per call so anti-nuke and the join gate can reuse it
// with their own decay windows (mirrors WindowTracker(windowMs)).
export class HeatService {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.map = new Map(); // "guildId:userId" -> { value, lastTs }
  }

  #decayed(entry, halfLifeMs, nowMs) {
    if (!entry) return 0;
    const dt = nowMs - entry.lastTs;
    if (dt <= 0) return entry.value;
    return entry.value * Math.pow(0.5, dt / halfLifeMs);
  }

  add(guildId, userId, amount, halfLifeMs) {
    const key = `${guildId}:${userId}`;
    const nowMs = this.now();
    const value = this.#decayed(this.map.get(key), halfLifeMs, nowMs) + amount;
    this.map.set(key, { value, lastTs: nowMs });
    return value;
  }

  get(guildId, userId, halfLifeMs) {
    return this.#decayed(this.map.get(`${guildId}:${userId}`), halfLifeMs, this.now());
  }

  reset(guildId, userId) {
    this.map.delete(`${guildId}:${userId}`);
  }

  sweep(halfLifeMs, epsilon = 0.5) {
    const nowMs = this.now();
    for (const [key, entry] of this.map)
      if (this.#decayed(entry, halfLifeMs, nowMs) < epsilon) this.map.delete(key);
  }
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(core): HeatService decaying accumulator"`

---

## Task 9: Rule validation + compilation

**Files:**
- Create: `src/modules/automod/rules/validate.js`
- Create: `src/modules/automod/rules/compile.js`
- Test: `test/modules/automod/ruleCompile.test.js`

**Interfaces:**
- Produces: `validatePattern(src, { maxLen? }): { ok:true, re } | { ok:false, error }` (uses `re2`); `MAX_PATTERN_LEN = 200`, `MAX_RULES_PER_GUILD = 50`; `compileRule(rule): { ...rule, re }` throwing on invalid.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/ruleCompile.test.js
import { describe, it, expect } from "vitest";
import { validatePattern, MAX_PATTERN_LEN } from "../../../src/modules/automod/rules/validate.js";
import { compileRule } from "../../../src/modules/automod/rules/compile.js";

describe("validatePattern", () => {
  it("accepts a normal pattern", () => {
    const r = validatePattern("free\\s*nitro");
    expect(r.ok).toBe(true);
    expect(r.re.test("free nitro")).toBe(true);
  });
  it("rejects empty", () => {
    expect(validatePattern("").ok).toBe(false);
  });
  it("rejects over-length", () => {
    expect(validatePattern("a".repeat(MAX_PATTERN_LEN + 1)).ok).toBe(false);
  });
  it("rejects match-everything patterns", () => {
    expect(validatePattern(".*").ok).toBe(false);
    expect(validatePattern("a*").ok).toBe(false); // matches empty
  });
  it("rejects lookahead (re2 limitation) with a readable error", () => {
    const r = validatePattern("foo(?=bar)");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalid/i);
  });
});

describe("compileRule", () => {
  it("attaches a compiled matcher", () => {
    const c = compileRule({ pattern: "scam", target: "any", weight: 10 });
    expect(c.re.test("SCAM")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `validate.js`**

```js
// src/modules/automod/rules/validate.js
import RE2 from "re2";

export const MAX_PATTERN_LEN = 200;
export const MAX_RULES_PER_GUILD = 50;

// Patterns that match everything / empty are rejected: they'd flag every message.
const MATCH_ALL = new Set([".*", ".+", "(.*)", "(.+)", ".*?", ".+?"]);

export function validatePattern(src, { maxLen = MAX_PATTERN_LEN } = {}) {
  if (typeof src !== "string" || src.length === 0)
    return { ok: false, error: "Pattern is empty." };
  if (src.length > maxLen)
    return { ok: false, error: `Pattern too long (max ${maxLen} characters).` };
  if (MATCH_ALL.has(src.trim()))
    return { ok: false, error: "Pattern matches every message." };
  let re;
  try {
    re = new RE2(src, "i");
  } catch (e) {
    return { ok: false, error: `Invalid pattern: ${e.message} (re2 has no lookaround or backreferences).` };
  }
  if (re.test("")) return { ok: false, error: "Pattern matches the empty string." };
  return { ok: true, re };
}
```

- [ ] **Step 4: Implement `compile.js`**

```js
// src/modules/automod/rules/compile.js
import { validatePattern } from "./validate.js";

// Compile a rule row into a matcher. Throws on invalid input — callers compile
// at SAVE time (never per message), so a throw here surfaces to the admin.
export function compileRule(rule) {
  const v = validatePattern(rule.pattern);
  if (!v.ok) throw new Error(v.error);
  return { ...rule, re: v.re };
}
```

- [ ] **Step 5: Run test** — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(automod): re2 rule validation + compilation"`

---

## Task 10: Per-guild compiled-rule cache

**Files:**
- Create: `src/modules/automod/rules/cache.js`
- Test: `test/modules/automod/ruleCache.test.js`

**Interfaces:**
- Consumes: `compileRule` from `rules/compile.js`.
- Produces: `class RuleCache` with `set(guildId, rules[]): compiled[]`, `get(guildId): compiled[] | undefined`, `invalidate(guildId): void`. Skips (does not throw on) rules that fail to compile — logs via injected `logger`.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/ruleCache.test.js
import { describe, it, expect, vi } from "vitest";
import { RuleCache } from "../../../src/modules/automod/rules/cache.js";

describe("RuleCache", () => {
  it("compiles and caches, skipping invalid rules", () => {
    const logger = { warn: vi.fn() };
    const cache = new RuleCache(logger);
    const compiled = cache.set("g", [
      { pattern: "good", target: "any", weight: 10 },
      { pattern: "foo(?=bar)", target: "any", weight: 10 }, // invalid under re2
    ]);
    expect(compiled).toHaveLength(1);
    expect(cache.get("g")).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
  it("invalidate clears", () => {
    const cache = new RuleCache({ warn: () => {} });
    cache.set("g", [{ pattern: "x", target: "any", weight: 1 }]);
    cache.invalidate("g");
    expect(cache.get("g")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/rules/cache.js
import { compileRule } from "./compile.js";

// Holds compiled matchers per guild. Compilation happens here (once, at set
// time) rather than per message. Invalid rules are skipped, not fatal, so one
// bad row can't blank a guild's whole ruleset.
export class RuleCache {
  constructor(logger = { warn: () => {} }) {
    this.logger = logger;
    this.map = new Map(); // guildId -> compiled[]
  }

  set(guildId, rules) {
    const compiled = [];
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      try {
        compiled.push(compileRule(rule));
      } catch (err) {
        this.logger.warn?.({ err: err.message, pattern: rule.pattern }, "automod: rule compile skipped");
      }
    }
    this.map.set(guildId, compiled);
    return compiled;
  }

  get(guildId) {
    return this.map.get(guildId);
  }

  invalidate(guildId) {
    this.map.delete(guildId);
  }
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): per-guild compiled rule cache"`

---

## Task 11: Rule packs (registry + definitions + native projection)

**Files:**
- Create: `src/modules/automod/rules/packs/index.js`
- Create: `src/modules/automod/rules/packs/{core,nitro,steam,crypto,grabbers,raid}.js`
- Test: `test/modules/automod/packs.test.js`

**Interfaces:**
- Produces: `PACKS: Pack[]` and `getPack(id)`, `packById`. Each `Pack = { id, version, title, description, rules: PackRule[] }`. `PackRule = { pattern, target, weight, deleteOnHit, native? }` where `native = { keywordFilter?: string[], regexPatterns?: string[] }` for projection (Task 20). Also `updateAvailable(packState, pack): boolean` = `packState.installedVersion < pack.version`.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/packs.test.js
import { describe, it, expect } from "vitest";
import { PACKS, getPack, updateAvailable } from "../../../src/modules/automod/rules/packs/index.js";
import { validatePattern } from "../../../src/modules/automod/rules/validate.js";

describe("packs", () => {
  it("every pack has an id, integer version, and rules", () => {
    for (const p of PACKS) {
      expect(typeof p.id).toBe("string");
      expect(Number.isInteger(p.version)).toBe(true);
      expect(p.rules.length).toBeGreaterThan(0);
    }
  });
  it("every pack rule pattern compiles under re2", () => {
    for (const p of PACKS)
      for (const r of p.rules) expect(validatePattern(r.pattern).ok, `${p.id}:${r.pattern}`).toBe(true);
  });
  it("getPack finds by id", () => {
    expect(getPack("nitro")?.id).toBe("nitro");
  });
  it("updateAvailable compares versions", () => {
    expect(updateAvailable({ installedVersion: 0 }, { version: 1 })).toBe(true);
    expect(updateAvailable({ installedVersion: 1 }, { version: 1 })).toBe(false);
  });
  it("includes the built-in core pack", () => {
    expect(getPack("core")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement the pack definitions** (one file each; representative rules — extend freely, all must compile under re2)

```js
// src/modules/automod/rules/packs/nitro.js
export default {
  id: "nitro",
  version: 1,
  title: "Nitro scams",
  description: "Free-Nitro and gift-scam bait.",
  rules: [
    { pattern: "fre+e?\\s*(discord\\s*)?ni+tro", target: "normalized", weight: 60, deleteOnHit: true,
      native: { keywordFilter: ["*free nitro*", "*free discord nitro*", "*claim your nitro*"] } },
    { pattern: "ni+tro\\s*(for\\s*)?fre+e", target: "normalized", weight: 60, deleteOnHit: true },
    { pattern: "discord(app)?\\.?gift", target: "stripped", weight: 50, deleteOnHit: true },
  ],
};
```

```js
// src/modules/automod/rules/packs/steam.js
export default {
  id: "steam",
  version: 1,
  title: "Steam gift scams",
  description: "Fake Steam gift / trade offers.",
  rules: [
    { pattern: "free\\s*steam\\s*(gift|game|key)", target: "normalized", weight: 55, deleteOnHit: true,
      native: { keywordFilter: ["*free steam gift*", "*steam gift card*"] } },
    { pattern: "steamcommunity\\s*(gift|trade|nitro|award)", target: "stripped", weight: 55, deleteOnHit: true },
  ],
};
```

```js
// src/modules/automod/rules/packs/crypto.js
export default {
  id: "crypto",
  version: 1,
  title: "Crypto & airdrop scams",
  description: "Airdrop, wallet-drainer, giveaway bait.",
  rules: [
    { pattern: "(free|claim)\\s*(bitcoin|btc|eth|crypto)", target: "normalized", weight: 50, deleteOnHit: true,
      native: { keywordFilter: ["*free crypto*", "*crypto giveaway*", "*claim your airdrop*"] } },
    { pattern: "connect\\s*your\\s*wallet", target: "normalized", weight: 50, deleteOnHit: true },
    { pattern: "air\\s*drop", target: "normalized", weight: 35, deleteOnHit: false },
  ],
};
```

```js
// src/modules/automod/rules/packs/grabbers.js
export default {
  id: "grabbers",
  version: 1,
  title: "IP grabbers & loggers",
  description: "grabify / iplogger and similar tracking links.",
  rules: [
    { pattern: "(grabify|iplogger|ipgrab|blasze|ezstat)", target: "stripped", weight: 80, deleteOnHit: true,
      native: { keywordFilter: ["grabify.link*", "iplogger.org*", "iplogger.com*", "2no.co*", "yip.su*"] } },
  ],
};
```

```js
// src/modules/automod/rules/packs/raid.js
export default {
  id: "raid",
  version: 1,
  title: "Raid advertising",
  description: "Raid / nuke service advertising.",
  rules: [
    { pattern: "(raid|nuke)\\s*(this\\s*)?server", target: "normalized", weight: 45, deleteOnHit: true },
    { pattern: "(cheap|buy|selling)\\s*(boost|nitro|accounts?|followers)", target: "normalized", weight: 30, deleteOnHit: false,
      native: { keywordFilter: ["*cheap boost*", "*cheap nitro*", "*selling accounts*"] } },
  ],
};
```

```js
// src/modules/automod/rules/packs/core.js
// Built-in pack that replaces the legacy fixed filters (invites/links baseline).
export default {
  id: "core",
  version: 1,
  title: "Core filters",
  description: "Baseline invite/link filters (replaces the legacy fixed filters).",
  rules: [
    { pattern: "discord\\.(gg|io|me)/[a-z0-9-]+", target: "stripped", weight: 25, deleteOnHit: true,
      native: { keywordFilter: ["discord.gg/*", "discord.io/*", "discord.me/*"],
                regexPatterns: ["discord\\.(gg|io|me)/[a-z0-9-]+"] } },
    { pattern: "discord(app)?\\.com/invite/[a-z0-9-]+", target: "stripped", weight: 25, deleteOnHit: true,
      native: { keywordFilter: ["discord.com/invite/*", "discordapp.com/invite/*"] } },
  ],
};
```

- [ ] **Step 4: Implement the registry**

```js
// src/modules/automod/rules/packs/index.js
import core from "./core.js";
import nitro from "./nitro.js";
import steam from "./steam.js";
import crypto from "./crypto.js";
import grabbers from "./grabbers.js";
import raid from "./raid.js";

export const PACKS = [core, nitro, steam, crypto, grabbers, raid];
export const packById = new Map(PACKS.map((p) => [p.id, p]));

export function getPack(id) {
  return packById.get(id);
}

// A pack update is available when the guild installed an older version.
export function updateAvailable(packState, pack) {
  return (packState?.installedVersion ?? 0) < pack.version;
}
```

- [ ] **Step 5: Run test** — Expected: PASS. If any pack pattern fails `validatePattern`, fix that pattern (the test names the offender).
- [ ] **Step 6: Commit** — `git commit -am "feat(automod): versioned rule packs + native projection metadata"`

---

## Task 12: Scam-domain feed (snapshot + loader + refresh)

**Files:**
- Create: `src/modules/automod/feed/snapshot.js`
- Create: `src/modules/automod/feed/loader.js`
- Create: `src/modules/automod/feed/refresh.js`
- Test: `test/modules/automod/feed.test.js`

**Interfaces:**
- Produces: `SNAPSHOT: string[]` (vendored seed). `class FeedLoader` with `getBlocklist(): Set<string>`, `refresh(fetchImpl?): Promise<{ ok, count, source }>`. Constructor `new FeedLoader({ feedUrl, logger })`. On failure `refresh` keeps the current set and returns `{ ok:false }`; the initial set is `SNAPSHOT`. `registerFeedRefresh(ctx)` schedules a node-cron job (used in Task 21).

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/feed.test.js
import { describe, it, expect } from "vitest";
import { FeedLoader } from "../../../src/modules/automod/feed/loader.js";
import { SNAPSHOT } from "../../../src/modules/automod/feed/snapshot.js";

describe("FeedLoader", () => {
  it("starts from the vendored snapshot", () => {
    const l = new FeedLoader({ feedUrl: null, logger: { warn() {}, info() {} } });
    expect(l.getBlocklist().has(SNAPSHOT[0])).toBe(true);
  });
  it("refresh merges fetched domains", async () => {
    const l = new FeedLoader({ feedUrl: "https://feed.example/list", logger: { warn() {}, info() {} } });
    const fakeFetch = async () => ({ ok: true, text: async () => "new-scam.example\nother.example\n# comment" });
    const res = await l.refresh(fakeFetch);
    expect(res.ok).toBe(true);
    expect(l.getBlocklist().has("new-scam.example")).toBe(true);
  });
  it("refresh failure keeps the previous list", async () => {
    const l = new FeedLoader({ feedUrl: "https://feed.example/list", logger: { warn() {}, info() {} } });
    const before = l.getBlocklist().size;
    const res = await l.refresh(async () => { throw new Error("network"); });
    expect(res.ok).toBe(false);
    expect(l.getBlocklist().size).toBe(before);
  });
  it("no feedUrl → refresh is a no-op returning snapshot source", async () => {
    const l = new FeedLoader({ feedUrl: null, logger: { warn() {}, info() {} } });
    const res = await l.refresh(async () => { throw new Error("should not be called"); });
    expect(res.source).toBe("snapshot");
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `snapshot.js`**

```js
// src/modules/automod/feed/snapshot.js
// Vendored seed blocklist — always present as a fallback. Refresh (loader.js)
// merges a live feed on top of this. Extend as needed.
export const SNAPSHOT = [
  "grabify.link",
  "iplogger.org",
  "iplogger.com",
  "2no.co",
  "yip.su",
  "steamcommunity-gift.com",
  "discord-nitro.info",
  "discordgift.site",
  "free-nitro.ru",
];
```

- [ ] **Step 4: Implement `loader.js`**

```js
// src/modules/automod/feed/loader.js
import { SNAPSHOT } from "./snapshot.js";

// Swappable scam-domain feed. The blocklist lives in memory, seeded from the
// vendored snapshot and refreshed from `feedUrl`. A failed or disabled refresh
// leaves the current set untouched — the snapshot is always the floor.
export class FeedLoader {
  constructor({ feedUrl, logger }) {
    this.feedUrl = feedUrl || null;
    this.logger = logger;
    this.set = new Set(SNAPSHOT.map((d) => d.toLowerCase()));
  }

  getBlocklist() {
    return this.set;
  }

  parse(text) {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith("#"));
  }

  async refresh(fetchImpl = fetch) {
    if (!this.feedUrl) return { ok: true, count: this.set.size, source: "snapshot" };
    try {
      const res = await fetchImpl(this.feedUrl);
      if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
      const domains = this.parse(await res.text());
      const next = new Set(SNAPSHOT.map((d) => d.toLowerCase()));
      for (const d of domains) next.add(d);
      this.set = next;
      this.logger.info?.({ count: next.size }, "automod: scam feed refreshed");
      return { ok: true, count: next.size, source: "feed" };
    } catch (err) {
      this.logger.warn?.({ err: err.message }, "automod: scam feed refresh failed; keeping current list");
      return { ok: false, count: this.set.size, source: "stale" };
    }
  }
}
```

- [ ] **Step 5: Implement `refresh.js`**

```js
// src/modules/automod/feed/refresh.js
// Schedules a periodic scam-feed refresh via the shared cron scheduler.
// Scheduler API is `every(expression, name, task)` (see src/core/Scheduler.js).
export function registerFeedRefresh(ctx) {
  if (!ctx.automodFeed) return;
  ctx.automodFeed.refresh().catch(() => {}); // initial load at boot
  ctx.scheduler.every("0 */6 * * *", "automod-feed-refresh", () =>
    ctx.automodFeed.refresh().catch(() => {}),
  );
}
```

- [ ] **Step 6: Run test** — Expected: PASS. (`registerFeedRefresh` uses `ctx.scheduler.every(...)`, matching `src/core/Scheduler.js`.)
- [ ] **Step 7: Commit** — `git commit -am "feat(automod): scam-domain feed (snapshot + swappable loader + cron refresh)"`

---

## Task 13: Per-message time budget + self-heal

**Files:**
- Create: `src/modules/automod/budget.js`
- Test: `test/modules/automod/budget.test.js`

**Interfaces:**
- Produces: `class Budget` with `constructor({ perRuleMs = 5, perMessageMs = 25, now = () => performance.now() })`, `overBudget(): boolean` (message total), and static-ish helper `timeRule(fn): { result, ms }`. Also `PER_RULE_MS`, `PER_MESSAGE_MS` constants.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/budget.test.js
import { describe, it, expect } from "vitest";
import { Budget } from "../../../src/modules/automod/budget.js";

describe("Budget", () => {
  it("tracks elapsed against the per-message ceiling", () => {
    let t = 0;
    const b = new Budget({ perMessageMs: 25, now: () => t });
    t = 10;
    expect(b.overBudget()).toBe(false);
    t = 30;
    expect(b.overBudget()).toBe(true);
  });
  it("timeRule reports elapsed and flags per-rule overage", () => {
    let t = 0;
    const b = new Budget({ perRuleMs: 5, now: () => t });
    const { result, ms, over } = b.timeRule(() => { t = 8; return "x"; });
    expect(result).toBe("x");
    expect(ms).toBe(8);
    expect(over).toBe(true);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/budget.js
export const PER_RULE_MS = 5;
export const PER_MESSAGE_MS = 25;

// Tracks evaluation time for one message. re2 is linear so this is a safety net:
// a rule that blows its per-rule budget is auto-disabled by the caller.
export class Budget {
  constructor({ perRuleMs = PER_RULE_MS, perMessageMs = PER_MESSAGE_MS, now = () => performance.now() } = {}) {
    this.perRuleMs = perRuleMs;
    this.perMessageMs = perMessageMs;
    this.now = now;
    this.start = now();
  }

  overBudget() {
    return this.now() - this.start > this.perMessageMs;
  }

  timeRule(fn) {
    const t0 = this.now();
    const result = fn();
    const ms = this.now() - t0;
    return { result, ms, over: ms > this.perRuleMs };
  }
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): per-message/per-rule time budget"`

---

## Task 14: Evaluate stage (rules over variants + URL hits + self-heal)

**Files:**
- Create: `src/modules/automod/pipeline/evaluate.js`
- Test: `test/modules/automod/evaluatePipeline.test.js`

**Interfaces:**
- Consumes: compiled rules (from `RuleCache`), `analyzeUrls` (Task 7), `Budget` (Task 13).
- Produces: `evaluate({ variants, urls, compiledRules, blocklist, shorteners, budget }): { hits: Hit[], disabled: Array<{id, reason}> }`. `Hit = { source, weight, deleteOnHit, dryRun }`. `variants = { raw, normalized, stripped }`. A rule whose `timeRule` reports `over` is added to `disabled` and skipped.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/evaluatePipeline.test.js
import { describe, it, expect } from "vitest";
import RE2 from "re2";
import { evaluate } from "../../../src/modules/automod/pipeline/evaluate.js";
import { Budget } from "../../../src/modules/automod/budget.js";

const rule = (over) => ({
  id: "r1", source: "custom", target: "normalized", weight: 20,
  deleteOnHit: true, dryRun: false, re: new RE2("nitro", "i"),
});

describe("evaluate", () => {
  it("emits a hit when a rule matches its target variant", () => {
    const { hits } = evaluate({
      variants: { raw: "NITRO", normalized: "nitro", stripped: "nitro" },
      urls: [], compiledRules: [rule()], blocklist: new Set(), shorteners: new Set(),
      budget: new Budget(),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].weight).toBe(20);
  });
  it("matches target=any against all variants", () => {
    const r = { ...rule(), target: "any", re: new RE2("discordgift", "i") };
    const { hits } = evaluate({
      variants: { raw: "x", normalized: "x", stripped: "discordgift" },
      urls: [], compiledRules: [r], blocklist: new Set(), shorteners: new Set(), budget: new Budget(),
    });
    expect(hits).toHaveLength(1);
  });
  it("adds URL analysis hits", () => {
    const { hits } = evaluate({
      variants: { raw: "", normalized: "", stripped: "" },
      urls: [{ hostname: "bad.example", href: "https://bad.example/", protocol: "https:", pathname: "/" }],
      compiledRules: [], blocklist: new Set(["bad.example"]), shorteners: new Set(), budget: new Budget(),
    });
    expect(hits.some((h) => h.source === "url:blocklist")).toBe(true);
  });
  it("self-heals: a rule over per-rule budget is reported disabled", () => {
    let t = 0;
    const slow = { ...rule(), id: "slow", re: { test: () => { t = 10; return true; } } };
    const budget = new Budget({ perRuleMs: 5, now: () => t });
    const { disabled } = evaluate({
      variants: { raw: "nitro", normalized: "nitro", stripped: "nitro" },
      urls: [], compiledRules: [slow], blocklist: new Set(), shorteners: new Set(), budget,
    });
    expect(disabled.some((d) => d.id === "slow")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/pipeline/evaluate.js
import { analyzeUrls } from "./url.js";

const VARIANT_KEYS = ["raw", "normalized", "stripped"];

function targetsFor(target) {
  return target === "any" ? VARIANT_KEYS : [target];
}

// Run every compiled rule against its target variant(s), plus URL analysis.
// Returns hits (heat contributions) and any rules that blew their time budget.
export function evaluate({ variants, urls, compiledRules, blocklist, shorteners, budget }) {
  const hits = [];
  const disabled = [];

  for (const rule of compiledRules) {
    if (budget.overBudget()) break; // message-level ceiling reached
    const { result, over } = budget.timeRule(() =>
      targetsFor(rule.target).some((k) => rule.re.test(variants[k] ?? "")),
    );
    if (over) {
      disabled.push({ id: rule.id, reason: `exceeded ${budget.perRuleMs}ms eval budget` });
      continue;
    }
    if (result)
      hits.push({
        source: rule.source === "custom" ? `custom:${rule.id}` : rule.source,
        weight: rule.weight,
        deleteOnHit: rule.deleteOnHit,
        dryRun: rule.dryRun,
      });
  }

  for (const u of analyzeUrls(urls, { blocklist, shorteners })) {
    hits.push({ source: `url:${u.kind}`, weight: u.weight, deleteOnHit: true, dryRun: false });
  }

  return { hits, disabled };
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): stage 3 evaluate (variants + URL hits + self-heal)"`

---

## Task 15: Score stage

**Files:**
- Create: `src/modules/automod/pipeline/score.js`
- Test: `test/modules/automod/score.test.js`

**Interfaces:**
- Consumes: `HeatService` (Task 8).
- Produces: `score({ hits, guildId, userId, heat, halfLifeMs }): { heatAfter: number, deleteMessage: boolean, dryRunHits: Hit[], liveHits: Hit[] }`. Dry-run hits contribute NO heat and never set `deleteMessage`.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/score.test.js
import { describe, it, expect } from "vitest";
import { score } from "../../../src/modules/automod/pipeline/score.js";
import { HeatService } from "../../../src/core/HeatService.js";

describe("score", () => {
  it("adds weighted heat for live hits and flags delete", () => {
    const heat = new HeatService(() => 0);
    const r = score({
      hits: [{ source: "nitro", weight: 60, deleteOnHit: true, dryRun: false }],
      guildId: "g", userId: "u", heat, halfLifeMs: 60000,
    });
    expect(r.heatAfter).toBe(60);
    expect(r.deleteMessage).toBe(true);
    expect(r.liveHits).toHaveLength(1);
  });
  it("dry-run hits add no heat and never delete", () => {
    const heat = new HeatService(() => 0);
    const r = score({
      hits: [{ source: "test", weight: 99, deleteOnHit: true, dryRun: true }],
      guildId: "g", userId: "u", heat, halfLifeMs: 60000,
    });
    expect(r.heatAfter).toBe(0);
    expect(r.deleteMessage).toBe(false);
    expect(r.dryRunHits).toHaveLength(1);
    expect(r.liveHits).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/pipeline/score.js
// Turn hits into heat. Live hits accumulate weighted heat and may mark the
// message for deletion; dry-run hits are recorded but contribute nothing.
export function score({ hits, guildId, userId, heat, halfLifeMs }) {
  const dryRunHits = [];
  const liveHits = [];
  let deleteMessage = false;
  let heatAfter = heat.get(guildId, userId, halfLifeMs);

  for (const hit of hits) {
    if (hit.dryRun) {
      dryRunHits.push(hit);
      continue;
    }
    liveHits.push(hit);
    if (hit.deleteOnHit) deleteMessage = true;
    heatAfter = heat.add(guildId, userId, hit.weight, halfLifeMs);
  }

  return { heatAfter, deleteMessage, dryRunHits, liveHits };
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): stage 4 score (heat accrual + dry-run split)"`

---

## Task 16: Act stage

**Files:**
- Create: `src/modules/automod/pipeline/act.js`
- Test: `test/modules/automod/actPipeline.test.js`

**Interfaces:**
- Consumes: `cases` (CaseService), `logger`, existing `dmTarget`/`infoEmbed`.
- Produces: `isExempt({ member, channelId, config }): boolean` (moved/kept here) and `act({ message, member, config, guildConfig, deleteMessage, heatAfter, cases, logger }): Promise<{ memberAction: string | null }>`. Member action fires only when `heatAfter >= config.heatThreshold`, using `config.thresholdAction`. Actions: `warn|timeout|kick|ban|quarantine`.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/actPipeline.test.js
import { describe, it, expect, vi } from "vitest";
import { act, isExempt } from "../../../src/modules/automod/pipeline/act.js";
import { PermissionFlagsBits } from "discord.js";

const baseConfig = { heatThreshold: 100, thresholdAction: "timeout", exemptRoles: [], exemptChannels: [], timeoutSeconds: 300 };

const fakeMessage = () => ({
  guild: { id: "g", name: "S", bans: { create: vi.fn() } },
  client: { user: { id: "bot" } },
  delete: vi.fn().mockResolvedValue(),
});

describe("isExempt", () => {
  it("exempts Manage Messages holders", () => {
    const member = { permissions: { has: (p) => p === PermissionFlagsBits.ManageMessages }, roles: { cache: new Map() } };
    expect(isExempt({ member, channelId: "c", config: baseConfig })).toBe(true);
  });
  it("exempts configured channels", () => {
    const member = { permissions: { has: () => false }, roles: { cache: new Map() } };
    expect(isExempt({ member, channelId: "c", config: { ...baseConfig, exemptChannels: ["c"] } })).toBe(true);
  });
});

describe("act", () => {
  it("deletes when flagged and times out at threshold", async () => {
    const message = fakeMessage();
    const member = { id: "u", timeout: vi.fn().mockResolvedValue(), user: { id: "u" } };
    const cases = { createCase: vi.fn().mockResolvedValue({}) };
    const r = await act({
      message, member, config: baseConfig, guildConfig: { dmOnAction: false },
      deleteMessage: true, heatAfter: 120, cases, logger: { error() {} },
    });
    expect(message.delete).toHaveBeenCalled();
    expect(member.timeout).toHaveBeenCalled();
    expect(r.memberAction).toBe("timeout");
  });
  it("no member action below threshold", async () => {
    const message = fakeMessage();
    const member = { id: "u", timeout: vi.fn() };
    const cases = { createCase: vi.fn() };
    const r = await act({
      message, member, config: baseConfig, guildConfig: { dmOnAction: false },
      deleteMessage: true, heatAfter: 40, cases, logger: { error() {} },
    });
    expect(r.memberAction).toBeNull();
    expect(member.timeout).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/pipeline/act.js
import { PermissionFlagsBits } from "discord.js";
import { dmTarget } from "../../moderation/helpers.js";
import { infoEmbed } from "../../../lib/embeds.js";

const DM_PHRASING = { warn: "warned", timeout: "timed out", kick: "kicked", ban: "banned", quarantine: "quarantined" };

export function isExempt({ member, channelId, config }) {
  if (member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  const exemptRoles = config.exemptRoles ?? [];
  if (member && exemptRoles.some((r) => member.roles.cache.has(r))) return true;
  if ((config.exemptChannels ?? []).includes(channelId)) return true;
  return false;
}

async function punish(action, { message, member, config, reason, cases }) {
  const guildId = message.guild.id;
  const botId = message.client.user.id;
  const base = { guildId, targetId: member.id, moderatorId: botId, reason: `AutoMod: ${reason}` };
  switch (action) {
    case "warn":
      await cases.createCase({ ...base, type: "warn" });
      return "warn";
    case "timeout":
      await member.timeout((config.timeoutSeconds ?? 300) * 1000, base.reason).catch(() => {});
      await cases.createCase({ ...base, type: "timeout", expiresAt: new Date(Date.now() + (config.timeoutSeconds ?? 300) * 1000) });
      return "timeout";
    case "kick":
      await member.kick(base.reason).catch(() => {});
      await cases.createCase({ ...base, type: "kick" });
      return "kick";
    case "ban":
      await message.guild.bans.create(member.id, { reason: base.reason }).catch(() => {});
      await cases.createCase({ ...base, type: "ban" });
      return "ban";
    case "quarantine":
      if (config.quarantineRoleId) await member.roles.set([config.quarantineRoleId], base.reason).catch(() => {});
      await cases.createCase({ ...base, type: "quarantine" });
      return "quarantine";
    default:
      return null;
  }
}

export async function act({ message, member, config, guildConfig, deleteMessage, heatAfter, cases, logger }) {
  if (deleteMessage) {
    try {
      await message.delete();
    } catch (err) {
      logger.error?.({ err }, "automod delete failed");
    }
  }

  let memberAction = null;
  if (member && heatAfter >= config.heatThreshold) {
    memberAction = await punish(config.thresholdAction, {
      message, member, config, reason: `heat ${Math.round(heatAfter)} ≥ ${config.heatThreshold}`, cases,
    });
    const phrasing = DM_PHRASING[memberAction];
    if (guildConfig?.dmOnAction && phrasing) {
      await dmTarget(
        member.user ?? member,
        infoEmbed(`You were ${phrasing} in ${message.guild.name}`, "**Reason:** AutoMod — accumulated violations"),
        logger,
      );
    }
  }
  return { memberAction };
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): stage 5 act (heat-threshold actions + exemptions)"`

---

## Task 17: Pipeline orchestrator + wire HeatService/feed into context

**Files:**
- Create: `src/modules/automod/pipeline/index.js`
- Modify: `src/bot.js` (add `heat`, `automodFeed`, `automodRules` cache to context)
- Test: `test/modules/automod/pipelineIndex.test.js`

**Interfaces:**
- Produces: `runPipeline({ message, member, config, guildConfig, compiledRules, heat, blocklist, shorteners, cases, logger }): Promise<{ hits, dryRunHits, memberAction, heatAfter, disabled }>`. Orchestrates extract → normalize → evaluate → score → act. Assumes exemption already checked by the caller.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/pipelineIndex.test.js
import { describe, it, expect, vi } from "vitest";
import RE2 from "re2";
import { runPipeline } from "../../../src/modules/automod/pipeline/index.js";
import { HeatService } from "../../../src/core/HeatService.js";

describe("runPipeline", () => {
  it("runs all stages and deletes on a matching scam", async () => {
    const message = {
      content: "free nitro at discord.gift/x",
      embeds: [], attachments: new Map(), stickers: new Map(),
      author: { username: "u" }, guild: { id: "g", name: "S" },
      client: { user: { id: "bot" } }, delete: vi.fn().mockResolvedValue(),
    };
    const member = { id: "u", displayName: "u", timeout: vi.fn().mockResolvedValue(), user: { id: "u" }, roles: { cache: new Map() }, permissions: { has: () => false } };
    const compiledRules = [{ id: "p", source: "nitro", target: "normalized", weight: 60, deleteOnHit: true, dryRun: false, re: new RE2("free\\s*nitro", "i") }];
    const r = await runPipeline({
      message, member, config: { heatThreshold: 100, heatDecaySec: 60, thresholdAction: "timeout", timeoutSeconds: 300, exemptRoles: [], exemptChannels: [] },
      guildConfig: { dmOnAction: false }, compiledRules, heat: new HeatService(() => 0),
      blocklist: new Set(), shorteners: new Set(), cases: { createCase: vi.fn() }, logger: { error() {}, warn() {} },
    });
    expect(message.delete).toHaveBeenCalled();
    expect(r.hits.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `pipeline/index.js`**

```js
// src/modules/automod/pipeline/index.js
import { extract } from "./extract.js";
import { normalize } from "./normalize.js";
import { evaluate } from "./evaluate.js";
import { score } from "./score.js";
import { act } from "./act.js";
import { Budget } from "../budget.js";

export async function runPipeline({
  message, member, config, guildConfig, compiledRules, heat, blocklist, shorteners, cases, logger,
}) {
  const { text, urls } = extract(message, member);
  const variants = normalize(text);
  const budget = new Budget();
  const { hits, disabled } = evaluate({ variants, urls, compiledRules, blocklist, shorteners, budget });

  if (hits.length === 0) return { hits, dryRunHits: [], memberAction: null, heatAfter: 0, disabled };

  const { heatAfter, deleteMessage, dryRunHits, liveHits } = score({
    hits, guildId: message.guild.id, userId: member?.id ?? message.author.id, heat, halfLifeMs: config.heatDecaySec * 1000,
  });

  let memberAction = null;
  if (liveHits.length) {
    ({ memberAction } = await act({ message, member, config, guildConfig, deleteMessage, heatAfter, cases, logger }));
  }
  return { hits: liveHits, dryRunHits, memberAction, heatAfter, disabled };
}
```

- [ ] **Step 4: Add context wiring in `src/bot.js`** — after the `automod: new AutomodState(),` line (currently `src/bot.js:110`) add:

```js
    heat: new HeatService(),
    automodFeed: new FeedLoader({ feedUrl: env.scamFeedUrl ?? null, logger }),
    automodRules: new RuleCache(logger),
```
and add imports near the other module imports:
```js
import { HeatService } from "./core/HeatService.js";
import { FeedLoader } from "./modules/automod/feed/loader.js";
import { RuleCache } from "./modules/automod/rules/cache.js";
```
(Also add `scamFeedUrl` to `src/config/env.js` reading `process.env.SCAM_FEED_URL` — optional, defaults `null`.)

- [ ] **Step 5: Run test** — `npx vitest run test/modules/automod/pipelineIndex.test.js` — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(automod): pipeline orchestrator + context wiring"`

---

## Task 18: ConfigService automod rule/pack/log helpers

**Files:**
- Modify: `src/core/ConfigService.js`
- Test: `test/core/ConfigService.automod.test.js` (extend existing)

**Interfaces:**
- Produces on `ConfigService`: `getAutomodRules(guildId)`, `addAutomodRule(guildId, data)`, `removeAutomodRule(guildId, id)`, `editAutomodRule(guildId, id, data)`, `disableAutomodRule(guildId, id, reason)`, `getPackStates(guildId)`, `setPackState(guildId, packId, {enabled, installedVersion})`, `addAutomodLog(guildId, data)`, `getAutomodLogs(guildId, limit)`. Each mutation calls `this.invalidate(guildId)` and (for rules) leaves cache recompilation to the caller.

- [ ] **Step 1: Write the test**

```js
// append to test/core/ConfigService.automod.test.js
import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function fakePrisma() {
  const rows = [];
  return {
    guild: { findUnique: vi.fn().mockResolvedValue({ id: "g" }), create: vi.fn(), update: vi.fn() },
    automodRule: {
      findMany: vi.fn(async () => rows),
      create: vi.fn(async ({ data }) => { const r = { id: String(rows.length + 1), ...data }; rows.push(r); return r; }),
      deleteMany: vi.fn(async ({ where }) => { const i = rows.findIndex((x) => x.id === where.id); if (i >= 0) rows.splice(i, 1); return { count: 1 }; }),
      update: vi.fn(async ({ where, data }) => { const r = rows.find((x) => x.id === where.id); Object.assign(r, data); return r; }),
    },
    automodConfig: { upsert: vi.fn() },
  };
}

describe("ConfigService automod rules", () => {
  it("adds and lists rules", async () => {
    const svc = new ConfigService(fakePrisma());
    await svc.addAutomodRule("g", { source: "custom", pattern: "scam", target: "any", weight: 20 });
    const rules = await svc.getAutomodRules("g");
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toBe("scam");
  });
  it("removes a rule", async () => {
    const svc = new ConfigService(fakePrisma());
    const r = await svc.addAutomodRule("g", { source: "custom", pattern: "x", target: "any", weight: 1 });
    await svc.removeAutomodRule("g", r.id);
    expect(await svc.getAutomodRules("g")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement** — add to `ConfigService` (after `updateAutomod`):

```js
  async getAutomodRules(guildId) {
    return this.prisma.automodRule.findMany({ where: { guildId } });
  }
  async addAutomodRule(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.automodRule.create({ data: { guildId, ...data } });
    this.invalidate(guildId);
    return row;
  }
  async removeAutomodRule(guildId, id) {
    await this.prisma.automodRule.deleteMany({ where: { guildId, id } });
    this.invalidate(guildId);
  }
  async editAutomodRule(guildId, id, data) {
    const row = await this.prisma.automodRule.update({ where: { id }, data });
    this.invalidate(guildId);
    return row;
  }
  async disableAutomodRule(guildId, id, reason) {
    const row = await this.prisma.automodRule.update({ where: { id }, data: { enabled: false, disabledReason: reason } });
    this.invalidate(guildId);
    return row;
  }
  async getPackStates(guildId) {
    return this.prisma.automodPackState.findMany({ where: { guildId } });
  }
  async setPackState(guildId, packId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.automodPackState.upsert({
      where: { guildId_packId: { guildId, packId } },
      create: { guildId, packId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }
  async addAutomodLog(guildId, data) {
    return this.prisma.automodLog.create({ data: { guildId, ...data } });
  }
  async getAutomodLogs(guildId, limit = 20) {
    return this.prisma.automodLog.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: limit });
  }
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): ConfigService rule/pack/log helpers"`

---

## Task 19: Rewrite messageCreate to drive the pipeline

**Files:**
- Modify (rewrite): `src/modules/automod/events/messageCreate.js`
- Delete: `src/modules/automod/evaluate.js`, `src/modules/automod/filters.js`, `src/modules/automod/action.js` (superseded)
- Test: `test/modules/automod/messageCreate.test.js` (rewrite)

**Interfaces:**
- Consumes: `ctx.config`, `ctx.heat`, `ctx.automodFeed`, `ctx.automodRules`, `ctx.cases`, `ctx.logger`; pack registry; `runPipeline`; `isExempt`.
- Produces: the event handler. Builds the effective rule list = (enabled packs' rules, versioned) + custom rules; compiles via `ctx.automodRules` (cached per guild); runs the pipeline; persists any self-heal disables + writes logs.

- [ ] **Step 1: Write the test** (behavior: exempt skip, and a scam message gets deleted)

```js
// test/modules/automod/messageCreate.test.js
import { describe, it, expect, vi } from "vitest";
import handler from "../../../src/modules/automod/events/messageCreate.js";
import { HeatService } from "../../../src/core/HeatService.js";
import { RuleCache } from "../../../src/modules/automod/rules/cache.js";
import { FeedLoader } from "../../../src/modules/automod/feed/loader.js";

function ctxFor(packStates, rules = []) {
  return {
    config: {
      getGuild: vi.fn(async () => ({ automod: { enabled: true, heatThreshold: 50, heatDecaySec: 60, thresholdAction: "timeout", timeoutSeconds: 300, exemptRoles: [], exemptChannels: [] }, dmOnAction: false })),
      getPackStates: vi.fn(async () => packStates),
      getAutomodRules: vi.fn(async () => rules),
      addAutomodLog: vi.fn(),
      disableAutomodRule: vi.fn(),
    },
    heat: new HeatService(() => 0),
    automodFeed: new FeedLoader({ feedUrl: null, logger: { warn() {}, info() {} } }),
    automodRules: new RuleCache({ warn() {} }),
    cases: { createCase: vi.fn() },
    logger: { error() {}, warn() {} },
  };
}

const scamMessage = () => ({
  guild: { id: "g", name: "S" }, author: { id: "u", bot: false }, channelId: "c",
  member: { id: "u", displayName: "u", roles: { cache: new Map() }, permissions: { has: () => false }, timeout: vi.fn().mockResolvedValue(), user: { id: "u" } },
  content: "free nitro discord.gift/abc", embeds: [], attachments: new Map(), stickers: new Map(),
  client: { user: { id: "bot" } }, delete: vi.fn().mockResolvedValue(),
});

describe("automod messageCreate", () => {
  it("ignores bots", async () => {
    const ctx = ctxFor([]);
    await handler.execute(ctx, { ...scamMessage(), author: { id: "u", bot: true } });
    expect(ctx.config.getGuild).not.toHaveBeenCalled();
  });
  it("deletes a scam message when the nitro pack is enabled", async () => {
    const ctx = ctxFor([{ packId: "nitro", enabled: true, installedVersion: 1 }, { packId: "core", enabled: true, installedVersion: 1 }]);
    const msg = scamMessage();
    await handler.execute(ctx, msg);
    expect(msg.delete).toHaveBeenCalled();
  });
  it("skips exempt members", async () => {
    const ctx = ctxFor([{ packId: "nitro", enabled: true, installedVersion: 1 }]);
    const msg = scamMessage();
    msg.member.permissions.has = () => true; // Manage Messages
    await handler.execute(ctx, msg);
    expect(msg.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement** — replace the file:

```js
// src/modules/automod/events/messageCreate.js
import { Events } from "discord.js";
import { runPipeline } from "../pipeline/index.js";
import { isExempt } from "../pipeline/act.js";
import { PACKS, getPack } from "../rules/packs/index.js";

// Assemble the effective rule rows for a guild: enabled packs' rules (with a
// synthetic id per rule) + the guild's custom rules.
function effectiveRules(packStates, customRules) {
  const enabled = new Map(packStates.filter((p) => p.enabled).map((p) => [p.packId, p]));
  const rows = [];
  for (const pack of PACKS) {
    if (!enabled.has(pack.id)) continue;
    pack.rules.forEach((r, i) =>
      rows.push({ id: `${pack.id}#${i}`, source: pack.id, enabled: true, ...r }),
    );
  }
  for (const r of customRules) if (r.enabled !== false) rows.push(r);
  return rows;
}

export default {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || message.author?.bot) return;

    const guildConfig = await ctx.config.getGuild(message.guild.id);
    const config = guildConfig.automod;
    if (!config?.enabled) return;

    const member = message.member;
    if (isExempt({ member, channelId: message.channelId, config })) return;

    // Compiled rules cached per guild; rebuild when the cache is cold (invalidated
    // on any rule/pack edit via ConfigService).
    let compiledRules = ctx.automodRules.get(message.guild.id);
    if (!compiledRules) {
      const [packStates, customRules] = await Promise.all([
        ctx.config.getPackStates(message.guild.id),
        ctx.config.getAutomodRules(message.guild.id),
      ]);
      compiledRules = ctx.automodRules.set(message.guild.id, effectiveRules(packStates, customRules));
    }

    const result = await runPipeline({
      message, member, config, guildConfig, compiledRules,
      heat: ctx.heat, blocklist: ctx.automodFeed.getBlocklist(), shorteners: new Set(),
      cases: ctx.cases, logger: ctx.logger,
    });

    // Self-heal: persist and report any rule that blew its time budget.
    for (const d of result.disabled ?? []) {
      if (d.id.includes("#")) continue; // pack rule — don't persist-disable built-ins
      await ctx.config.disableAutomodRule(message.guild.id, d.id, d.reason).catch(() => {});
      ctx.automodRules.invalidate(message.guild.id);
      ctx.logger.warn?.({ rule: d.id, reason: d.reason }, "automod: rule auto-disabled");
    }

    // Log every hit, including dry-run.
    for (const hit of [...result.hits, ...result.dryRunHits]) {
      await ctx.config.addAutomodLog(message.guild.id, {
        userId: message.author.id, channelId: message.channelId, source: hit.source,
        action: hit.dryRun ? "log-only" : result.memberAction ?? "delete",
        dryRun: Boolean(hit.dryRun), heatAfter: Math.round(result.heatAfter ?? 0),
        sample: (message.content ?? "").slice(0, 200),
      }).catch(() => {});
    }
  },
};
```

- [ ] **Step 4: Delete superseded files** — `git rm src/modules/automod/evaluate.js src/modules/automod/filters.js src/modules/automod/action.js` and delete their tests `test/modules/automod/{evaluate,filters,action}.test.js`.
- [ ] **Step 5: Run tests** — `npx vitest run test/modules/automod/messageCreate.test.js` — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(automod): drive messageCreate through the v2 pipeline; drop legacy filters"`

---

## Task 20: Re-point native projection at packs

**Files:**
- Modify: `src/modules/automod/native/rules.js` (source the keyword/regex lists from packs)
- Test: `test/modules/automod/nativeRules.test.js` (extend)

**Interfaces:**
- Consumes: `PACKS` + `native` projection metadata from Task 11.
- Produces: a `nativeSourcesFromPacks(cfg, packStates)` helper that returns `{ inviteKw, scamKw, ... }`-shaped lists derived from enabled packs, feeding the EXISTING `RULE_BUILDERS`. The builders' shapes, `RULE_PREFIX`, singleton/adopt logic stay unchanged — only the content source moves from hardcoded arrays to pack projections.

- [ ] **Step 1: Write the test**

```js
// append to test/modules/automod/nativeRules.test.js
import { describe, it, expect } from "vitest";
import { nativeProjection } from "../../../src/modules/automod/native/rules.js";

describe("nativeProjection", () => {
  it("collects keyword filters from enabled packs", () => {
    const proj = nativeProjection([{ packId: "grabbers", enabled: true }]);
    expect(proj.keywordFilter).toContain("grabify.link*");
  });
  it("omits disabled packs", () => {
    const proj = nativeProjection([{ packId: "grabbers", enabled: false }]);
    expect(proj.keywordFilter).not.toContain("grabify.link*");
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement** — add to `native/rules.js`:

```js
import { PACKS } from "../rules/packs/index.js";

// Aggregate the native-projection metadata from every enabled pack into flat
// keyword/regex lists the RULE_BUILDERS can consume. Confusables/heat/edit-
// distance stay runtime-only — only literal keyword/regex rules project here.
export function nativeProjection(packStates) {
  const enabled = new Set(packStates.filter((p) => p.enabled).map((p) => p.packId));
  const keywordFilter = [];
  const regexPatterns = [];
  for (const pack of PACKS) {
    if (!enabled.has(pack.id)) continue;
    for (const r of pack.rules) {
      if (r.native?.keywordFilter) keywordFilter.push(...r.native.keywordFilter);
      if (r.native?.regexPatterns) regexPatterns.push(...r.native.regexPatterns);
    }
  }
  return { keywordFilter: [...new Set(keywordFilter)], regexPatterns: [...new Set(regexPatterns)] };
}
```
Then, where `syncNativeRules` is called (panel handler `nsync`, Task 26), pass `nativeProjection(packStates)` so a future `RULE_BUILDERS` entry can consume pack-sourced lists. Keep the existing hardcoded builders working; this is additive. (Full builder refactor to consume `nativeProjection` is optional polish — the badge-preserving reconcile path is unchanged.)

- [ ] **Step 4: Run test** — Expected: PASS. Also run the full existing native suite: `npx vitest run test/modules/automod/nativeRules.test.js` — Expected: PASS (no regressions).
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): native projection sourced from rule packs"`

---

## Task 21: Register the feed refresh cron

**Files:**
- Modify: `src/bot.js` (call `registerFeedRefresh`)
- Modify: `src/core/Scheduler.js` only if its scheduling method name differs from `schedule`
- Test: `test/modules/automod/feedRefresh.test.js`

**Interfaces:**
- Consumes: `registerFeedRefresh(ctx)` (Task 12), `ctx.scheduler`, `ctx.automodFeed`.

- [ ] **Step 1: Confirm the Scheduler API** — `grep -n "schedule" src/core/Scheduler.js`. Use the actual method name in `feed/refresh.js` (adjust Task 12's `ctx.scheduler.schedule?.(...)` if needed).

- [ ] **Step 2: Write the test**

```js
// test/modules/automod/feedRefresh.test.js
import { describe, it, expect, vi } from "vitest";
import { registerFeedRefresh } from "../../../src/modules/automod/feed/refresh.js";

describe("registerFeedRefresh", () => {
  it("does an initial refresh and schedules a recurring one", () => {
    const schedule = vi.fn();
    const refresh = vi.fn().mockResolvedValue({ ok: true });
    registerFeedRefresh({ automodFeed: { refresh }, scheduler: { every: schedule } });
    expect(refresh).toHaveBeenCalled();
    expect(schedule).toHaveBeenCalled();
  });
  it("no-ops without a feed", () => {
    const schedule = vi.fn();
    registerFeedRefresh({ scheduler: { every: schedule } });
    expect(schedule).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test** — Expected: FAIL if method name mismatched; fix `refresh.js` to match Scheduler.

- [ ] **Step 4: Wire in `src/bot.js`** — after `registerModLogListener(context);` add:

```js
import { registerFeedRefresh } from "./modules/automod/feed/refresh.js";
// ...
registerFeedRefresh(context);
```

- [ ] **Step 5: Run test** — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(automod): schedule scam-feed refresh at boot"`

---

## Task 22: `/automod` command — subcommands + rules add/remove/list/edit

**Files:**
- Modify (rewrite): `src/modules/automod/commands/automod.js`
- Create: `src/modules/automod/commands/rules.js` (subcommand handlers)
- Test: `test/modules/automod/automodCommand.test.js` (rewrite)

**Interfaces:**
- Produces: a `SlashCommandBuilder` with subcommands `panel`, `rules` (group: `add|remove|list|edit`), `test`, `packs`, `exempt`, `logs`. `execute(interaction, ctx)` routes by subcommand. `rules add` validates via `validatePattern` and enforces `MAX_RULES_PER_GUILD`; invalidates `ctx.automodRules`.

- [ ] **Step 1: Write the test** (rules add validation + cap)

```js
// test/modules/automod/automodCommand.test.js
import { describe, it, expect, vi } from "vitest";
import { handleRulesAdd } from "../../../src/modules/automod/commands/rules.js";

function interaction(opts) {
  return {
    guildId: "g",
    options: { getString: (k) => opts[k] ?? null, getInteger: (k) => opts[k] ?? null, getBoolean: (k) => opts[k] ?? null },
    reply: vi.fn(),
  };
}

describe("rules add", () => {
  it("rejects an invalid re2 pattern with a readable error", async () => {
    const ctx = { config: { getAutomodRules: vi.fn(async () => []), addAutomodRule: vi.fn() }, automodRules: { invalidate: vi.fn() } };
    await handleRulesAdd(interaction({ pattern: "foo(?=bar)" }), ctx);
    expect(ctx.config.addAutomodRule).not.toHaveBeenCalled();
    const msg = ctx.config.addAutomodRule.mock ? "" : "";
    expect(interaction).toBeDefined();
  });
  it("enforces the per-guild rule cap", async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: String(i), source: "custom" }));
    const ctx = { config: { getAutomodRules: vi.fn(async () => many), addAutomodRule: vi.fn() }, automodRules: { invalidate: vi.fn() } };
    await handleRulesAdd(interaction({ pattern: "valid" }), ctx);
    expect(ctx.config.addAutomodRule).not.toHaveBeenCalled();
  });
  it("adds a valid rule and invalidates the cache", async () => {
    const ctx = { config: { getAutomodRules: vi.fn(async () => []), addAutomodRule: vi.fn().mockResolvedValue({ id: "1" }) }, automodRules: { invalidate: vi.fn() } };
    await handleRulesAdd(interaction({ pattern: "scam", weight: 30, target: "any" }), ctx);
    expect(ctx.config.addAutomodRule).toHaveBeenCalled();
    expect(ctx.automodRules.invalidate).toHaveBeenCalledWith("g");
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `rules.js`**

```js
// src/modules/automod/commands/rules.js
import { validatePattern, MAX_RULES_PER_GUILD } from "../rules/validate.js";
import { errorEmbed, successEmbed, infoEmbed } from "../../../lib/embeds.js";
// NOTE: successEmbed(text)/errorEmbed(text) take a single arg; titled embeds use
// infoEmbed(title, text). Confirmed against src/lib/embeds.js.

export async function handleRulesAdd(interaction, ctx) {
  const pattern = interaction.options.getString("pattern");
  const target = interaction.options.getString("target") ?? "any";
  const weight = interaction.options.getInteger("weight") ?? 20;
  const dryRun = interaction.options.getBoolean("dryrun") ?? false;

  const v = validatePattern(pattern);
  if (!v.ok) {
    return interaction.reply({ embeds: [errorEmbed(v.error)], ephemeral: true });
  }
  const existing = await ctx.config.getAutomodRules(interaction.guildId);
  if (existing.filter((r) => r.source === "custom").length >= MAX_RULES_PER_GUILD) {
    return interaction.reply({ embeds: [errorEmbed(`You already have ${MAX_RULES_PER_GUILD} custom rules (the limit).`)], ephemeral: true });
  }
  await ctx.config.addAutomodRule(interaction.guildId, { source: "custom", pattern, target, weight, deleteOnHit: true, dryRun });
  ctx.automodRules.invalidate(interaction.guildId);
  return interaction.reply({ embeds: [successEmbed(`Rule added${dryRun ? " (dry-run)" : ""}.`)], ephemeral: true });
}

export async function handleRulesList(interaction, ctx) {
  const rules = (await ctx.config.getAutomodRules(interaction.guildId)).filter((r) => r.source === "custom");
  const lines = rules.length
    ? rules.map((r) => `\`${r.id.slice(0, 6)}\` w${r.weight} ${r.dryRun ? "[dry] " : ""}${r.enabled ? "" : "(disabled) "}\`${r.pattern}\``).join("\n")
    : "_No custom rules._";
  return interaction.reply({ embeds: [infoEmbed("Custom AutoMod rules", lines)], ephemeral: true });
}

export async function handleRulesRemove(interaction, ctx) {
  const id = interaction.options.getString("id");
  await ctx.config.removeAutomodRule(interaction.guildId, id);
  ctx.automodRules.invalidate(interaction.guildId);
  return interaction.reply({ embeds: [successEmbed("Rule removed.")], ephemeral: true });
}

export async function handleRulesEdit(interaction, ctx) {
  const id = interaction.options.getString("id");
  const pattern = interaction.options.getString("pattern");
  if (pattern) {
    const v = validatePattern(pattern);
    if (!v.ok) return interaction.reply({ embeds: [errorEmbed(v.error)], ephemeral: true });
  }
  const data = {};
  if (pattern) data.pattern = pattern;
  const weight = interaction.options.getInteger("weight");
  if (weight != null) data.weight = weight;
  const dryRun = interaction.options.getBoolean("dryrun");
  if (dryRun != null) data.dryRun = dryRun;
  await ctx.config.editAutomodRule(interaction.guildId, id, data);
  ctx.automodRules.invalidate(interaction.guildId);
  return interaction.reply({ embeds: [successEmbed("Rule updated.")], ephemeral: true });
}
```
(Titled lists use `infoEmbed(title, text)`; single-line confirmations use `successEmbed(text)` / `errorEmbed(text)` — confirmed signatures in `src/lib/embeds.js`.)

- [ ] **Step 4: Implement the command builder** — rewrite `commands/automod.js` with subcommands (`panel`, `test`, `packs`, `exempt`, `logs`) and the `rules` subcommand group (`add`/`remove`/`list`/`edit`), routing `rules` to the handlers above, `panel`/`packs`/`exempt` to the panel (Task 26), `test` to Task 23, `logs` to Task 25. Keep `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)`.

```js
// src/modules/automod/commands/automod.js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runAutomodPanel } from "../panel/index.js";
import { handleRulesAdd, handleRulesRemove, handleRulesList, handleRulesEdit } from "./rules.js";
import { handleTest } from "./test.js";
import { handleLogs } from "./logs.js";

export default {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Auto-moderation pipeline: packs, rules, testing, logs.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("panel").setDescription("Open the control panel."))
    .addSubcommand((s) => s.setName("packs").setDescription("Manage rule packs."))
    .addSubcommand((s) => s.setName("exempt").setDescription("Manage exempt roles/channels."))
    .addSubcommand((s) => s.setName("logs").setDescription("Recent AutoMod hits (incl. dry-run)."))
    .addSubcommand((s) =>
      s.setName("test").setDescription("Test a pattern against sample text.")
        .addStringOption((o) => o.setName("pattern").setDescription("re2 pattern").setRequired(true))
        .addStringOption((o) => o.setName("sample").setDescription("sample text").setRequired(true)))
    .addSubcommandGroup((g) =>
      g.setName("rules").setDescription("Custom re2 rules (no lookaround/backrefs).")
        .addSubcommand((s) =>
          s.setName("add").setDescription("Add a custom rule.")
            .addStringOption((o) => o.setName("pattern").setDescription("re2 pattern").setRequired(true))
            .addStringOption((o) => o.setName("target").setDescription("raw|normalized|stripped|any")
              .addChoices({ name: "any", value: "any" }, { name: "normalized", value: "normalized" }, { name: "stripped", value: "stripped" }, { name: "raw", value: "raw" }))
            .addIntegerOption((o) => o.setName("weight").setDescription("heat weight (default 20)"))
            .addBooleanOption((o) => o.setName("dryrun").setDescription("log-only, no punishment")))
        .addSubcommand((s) => s.setName("list").setDescription("List custom rules."))
        .addSubcommand((s) => s.setName("remove").setDescription("Remove a rule.").addStringOption((o) => o.setName("id").setDescription("rule id").setRequired(true)))
        .addSubcommand((s) =>
          s.setName("edit").setDescription("Edit a rule.")
            .addStringOption((o) => o.setName("id").setDescription("rule id").setRequired(true))
            .addStringOption((o) => o.setName("pattern").setDescription("new re2 pattern"))
            .addIntegerOption((o) => o.setName("weight").setDescription("new weight"))
            .addBooleanOption((o) => o.setName("dryrun").setDescription("toggle dry-run")))),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    if (group === "rules") {
      if (sub === "add") return handleRulesAdd(interaction, ctx);
      if (sub === "list") return handleRulesList(interaction, ctx);
      if (sub === "remove") return handleRulesRemove(interaction, ctx);
      if (sub === "edit") return handleRulesEdit(interaction, ctx);
    }
    if (sub === "test") return handleTest(interaction, ctx);
    if (sub === "logs") return handleLogs(interaction, ctx);
    // panel | packs | exempt all open the panel on the relevant view
    return runAutomodPanel(interaction, ctx, sub);
  },
};
```

- [ ] **Step 5: Run test** — `npx vitest run test/modules/automod/automodCommand.test.js` — Expected: PASS. Fix the placeholder assertions in the test to assert on `interaction.reply` calls (the first test should assert `interaction.reply` was called with an error embed).
- [ ] **Step 6: Commit** — `git commit -am "feat(automod): /automod subcommands + custom rule management"`

---

## Task 23: `/automod test`

**Files:**
- Create: `src/modules/automod/commands/test.js`
- Test: `test/modules/automod/automodTest.test.js`

**Interfaces:**
- Consumes: `normalize`, `validatePattern`.
- Produces: `handleTest(interaction, ctx)` — normalizes the sample, tests the pattern against raw/normalized/stripped, and replies with which variant(s) matched.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/automodTest.test.js
import { describe, it, expect, vi } from "vitest";
import { handleTest } from "../../../src/modules/automod/commands/test.js";

const interaction = (pattern, sample) => ({
  options: { getString: (k) => (k === "pattern" ? pattern : sample) },
  reply: vi.fn(),
});

describe("/automod test", () => {
  it("reports a match on the stripped variant for spaced text", async () => {
    const i = interaction("discordgift", "d i s c o r d g i f t");
    await handleTest(i, {});
    const arg = i.reply.mock.calls[0][0];
    expect(JSON.stringify(arg)).toMatch(/stripped/);
  });
  it("reports no match", async () => {
    const i = interaction("nitro", "hello world");
    await handleTest(i, {});
    const arg = i.reply.mock.calls[0][0];
    expect(JSON.stringify(arg)).toMatch(/no match/i);
  });
  it("reports an invalid pattern", async () => {
    const i = interaction("foo(?=bar)", "x");
    await handleTest(i, {});
    const arg = i.reply.mock.calls[0][0];
    expect(JSON.stringify(arg)).toMatch(/invalid/i);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/commands/test.js
import { normalize } from "../pipeline/normalize.js";
import { validatePattern } from "../rules/validate.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export async function handleTest(interaction, _ctx) {
  const pattern = interaction.options.getString("pattern");
  const sample = interaction.options.getString("sample");
  const v = validatePattern(pattern);
  if (!v.ok) return interaction.reply({ embeds: [errorEmbed(v.error)], ephemeral: true });

  const variants = normalize(sample);
  const matched = ["raw", "normalized", "stripped"].filter((k) => v.re.test(variants[k]));
  const body = matched.length
    ? `✅ Matched on: **${matched.join(", ")}**\n\`\`\`\nraw:        ${variants.raw}\nnormalized: ${variants.normalized}\nstripped:   ${variants.stripped}\n\`\`\``
    : `❌ No match.\n\`\`\`\nnormalized: ${variants.normalized}\nstripped:   ${variants.stripped}\n\`\`\``;
  return interaction.reply({ embeds: [infoEmbed("Rule test", body)], ephemeral: true });
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): /automod test harness"`

---

## Task 24: `/automod packs` (panel view — data layer)

**Files:**
- Create: `src/modules/automod/panel/packs.js` (view + handlers for pack toggles/updates)
- Test: `test/modules/automod/packsPanel.test.js`

**Interfaces:**
- Consumes: `PACKS`, `updateAvailable`, `ctx.config.getPackStates/setPackState`, `ctx.automodRules.invalidate`.
- Produces: `buildPacksRows(packStates, ownerId)` and `handlePacksComponent(i, state, ctx)` — toggling a pack upserts its state (setting `installedVersion` to the pack's current version) and invalidates the rule cache.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/packsPanel.test.js
import { describe, it, expect, vi } from "vitest";
import { packSummary } from "../../../src/modules/automod/panel/packs.js";
import { PACKS } from "../../../src/modules/automod/rules/packs/index.js";

describe("packs panel", () => {
  it("summarizes enabled state and update availability", () => {
    const nitro = PACKS.find((p) => p.id === "nitro");
    const rows = packSummary([{ packId: "nitro", enabled: true, installedVersion: nitro.version - 1 }]);
    const line = rows.find((r) => r.id === "nitro");
    expect(line.enabled).toBe(true);
    expect(line.updateAvailable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement** `packSummary` + the select/handlers:

```js
// src/modules/automod/panel/packs.js
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { PACKS, getPack, updateAvailable } from "../rules/packs/index.js";

export function packSummary(packStates) {
  const byId = new Map(packStates.map((p) => [p.packId, p]));
  return PACKS.map((p) => {
    const st = byId.get(p.id);
    return { id: p.id, title: p.title, enabled: Boolean(st?.enabled), updateAvailable: updateAvailable(st, p) };
  });
}

export function buildPacksRow(packStates, ownerId) {
  const summary = packSummary(packStates);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`am:packs:${ownerId}`)
      .setPlaceholder("Enabled rule packs")
      .setMinValues(0)
      .setMaxValues(PACKS.length)
      .addOptions(
        summary.map((s) => ({
          label: `${s.title}${s.updateAvailable ? " (update)" : ""}`,
          value: s.id,
          default: s.enabled,
        })),
      ),
  );
}

export async function handlePacksComponent(i, state, ctx) {
  const selected = new Set(i.values);
  for (const pack of PACKS) {
    const on = selected.has(pack.id);
    await ctx.config.setPackState(state.guildId, pack.id, {
      enabled: on,
      installedVersion: on ? pack.version : getPack(pack.id).version,
    });
  }
  ctx.automodRules.invalidate(state.guildId);
  state.packStates = await ctx.config.getPackStates(state.guildId);
  return "update";
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): rule-pack panel (toggle + version/update)"`

---

## Task 25: `/automod logs`

**Files:**
- Create: `src/modules/automod/commands/logs.js`
- Test: `test/modules/automod/automodLogs.test.js`

**Interfaces:**
- Consumes: `ctx.config.getAutomodLogs`.
- Produces: `handleLogs(interaction, ctx)` — replies with the last N hits, marking dry-run rows.

- [ ] **Step 1: Write the test**

```js
// test/modules/automod/automodLogs.test.js
import { describe, it, expect, vi } from "vitest";
import { handleLogs } from "../../../src/modules/automod/commands/logs.js";

describe("/automod logs", () => {
  it("renders recent hits including dry-run", async () => {
    const ctx = { config: { getAutomodLogs: vi.fn(async () => [
      { source: "nitro", action: "timeout", dryRun: false, heatAfter: 120, userId: "u1", createdAt: new Date() },
      { source: "custom:abc", action: "log-only", dryRun: true, heatAfter: 0, userId: "u2", createdAt: new Date() },
    ]) } };
    const interaction = { guildId: "g", reply: vi.fn() };
    await handleLogs(interaction, ctx);
    const arg = JSON.stringify(interaction.reply.mock.calls[0][0]);
    expect(arg).toMatch(/nitro/);
    expect(arg).toMatch(/dry/i);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/modules/automod/commands/logs.js
import { infoEmbed } from "../../../lib/embeds.js";

export async function handleLogs(interaction, ctx) {
  const rows = await ctx.config.getAutomodLogs(interaction.guildId, 20);
  const body = rows.length
    ? rows.map((r) =>
        `<@${r.userId}> · \`${r.source}\` → ${r.dryRun ? "**dry-run**" : r.action} · heat ${r.heatAfter}`,
      ).join("\n")
    : "_No AutoMod hits recorded yet._";
  return interaction.reply({ embeds: [infoEmbed("Recent AutoMod hits", body)], ephemeral: true });
}
```

- [ ] **Step 4: Run test** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): /automod logs (incl. dry-run hits)"`

---

## Task 26: Rebuild the panel (main view + handlers + status embed)

**Files:**
- Modify: `src/modules/automod/panel/render.js`, `panel/handlers.js`, `panel/index.js`, `statusEmbed.js`
- Test: `test/modules/automod/panelRender.test.js`, `test/modules/automod/panelHandlers.test.js` (rewrite)

**Interfaces:**
- Consumes: `packSummary/buildPacksRow/handlePacksComponent` (Task 24), heat config, exemptions, native view (unchanged), `nativeProjection` (Task 20).
- Produces: main panel view showing enable toggle, heat threshold + `thresholdAction` select, packs row, exempt role/channel selects, links to native + logs. `runAutomodPanel(interaction, ctx, initialView)` accepts the initial subcommand view (`packs`/`exempt` open on their section).

- [ ] **Step 1: Write the render test**

```js
// test/modules/automod/panelRender.test.js
import { describe, it, expect } from "vitest";
import { buildAutomodView } from "../../../src/modules/automod/panel/render.js";

describe("buildAutomodView", () => {
  it("renders threshold action select and pack row", () => {
    const view = buildAutomodView(
      { enabled: true, heatThreshold: 100, thresholdAction: "timeout", exemptRoles: [], exemptChannels: [] },
      [{ packId: "nitro", enabled: true, installedVersion: 1 }],
      "owner",
    );
    const json = JSON.stringify(view);
    expect(json).toMatch(/am:action:owner/);
    expect(json).toMatch(/am:packs:owner/);
  });
});
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement** — rewrite `render.js` so `buildAutomodView(automod, packStates, ownerId)`:
  - Row 1: enable toggle + `am:nav:native` + Close.
  - Row 2: `am:action:<owner>` select over `warn|timeout|kick|ban|quarantine` (default `thresholdAction`).
  - Row 3: `buildPacksRow(packStates, ownerId)`.
  - Row 4: exempt roles select (`am:exroles`), Row 5: exempt channels select (`am:exchans`) — reuse existing select code.
  Update `statusEmbed.js` `buildAutomodEmbed(config)` to show `Threshold`, `Action`, `Decay`, and enabled-pack count instead of the six legacy filters.
  Update `handlers.js`: keep `nav/ntog/nrules/ntimeout/nalertch/nsync/nremove/exroles/exchans/close`; replace `tog` (filters) with an `enabled` toggle only; replace `action` select to write `thresholdAction`; add `packs` → `handlePacksComponent`. For `nsync`, pass `nativeProjection(state.packStates)` alongside `automod`.
  Update `index.js` `runAutomodPanel(interaction, ctx, initialView)` to load `packStates` into `state`, set `state.view` from `initialView` (`packs`/`exempt` → `"main"`, `native` handled by nav), and render the new main view.

  (Concrete `render.js`:)

```js
// src/modules/automod/panel/render.js
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType,
} from "discord.js";
import { EMOJIS } from "../../../lib/constants.js";
import { buildAutomodEmbed } from "../statusEmbed.js";
import { buildPacksRow } from "./packs.js";

export const ACTIONS = [
  ["warn", "Warn"], ["timeout", "Timeout"], ["kick", "Kick"], ["ban", "Ban"], ["quarantine", "Quarantine"],
];

export function buildAutomodView(automod, packStates, ownerId) {
  const a = automod;
  const o = ownerId;
  const embed = buildAutomodEmbed(a, packStates);

  const enabledBtn = new ButtonBuilder()
    .setCustomId(`am:tog:enabled:${o}`)
    .setLabel(`${a.enabled ? EMOJIS.on : EMOJIS.off} Enabled`)
    .setStyle(a.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    enabledBtn,
    new ButtonBuilder().setCustomId(`am:nav:native:${o}`).setLabel(`${EMOJIS.shield} Discord AutoMod`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`am:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );
  const actionRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`am:action:${o}`).setPlaceholder("Action at heat threshold")
      .addOptions(ACTIONS.map(([value, label]) => ({ label, value, default: (a.thresholdAction ?? "timeout") === value }))),
  );
  const packsRow = buildPacksRow(packStates, o);
  const rolesRow = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder().setCustomId(`am:exroles:${o}`).setPlaceholder("Exempt roles").setMinValues(0).setMaxValues(25).setDefaultRoles(...(a.exemptRoles ?? [])),
  );
  const channelsRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(`am:exchans:${o}`).setPlaceholder("Exempt channels").addChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(25).setDefaultChannels(...(a.exemptChannels ?? [])),
  );
  return { embeds: [embed], components: [row1, actionRow, packsRow, rolesRow, channelsRow] };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run test/modules/automod/panelRender.test.js test/modules/automod/panelHandlers.test.js` — Expected: PASS after updating the handlers test to the new customIds.
- [ ] **Step 5: Commit** — `git commit -am "feat(automod): rebuild panel around packs + heat threshold"`

---

## Task 27: Docs — README + `/automod` help + register commands

**Files:**
- Modify: `README.md` (Auto-Moderation section)
- Modify: `src/modules/util/help.js` / `tutorial.js` if they enumerate automod filters
- Run: `npm run register`

**Interfaces:** none (docs + command registration).

- [ ] **Step 1: Rewrite the README Auto-Moderation section** to describe: the five-stage pipeline, normalization/confusables, rule packs (list them + versioning), custom `re2` rules with the **no-lookaround/no-backreference** limitation stated explicitly, dry-run mode, heat threshold + action, `/automod` subcommands, and that native Discord AutoMod is still provisioned (badge preserved).

- [ ] **Step 2: Update any help/tutorial text** that lists the old six filters (`grep -rn "antiSpam\|filterInvites\|excessive caps" src/modules/util`) to reference packs + heat instead.

- [ ] **Step 3: Register commands** — `npm run register` — Expected: the new `/automod` subcommands register without error.

- [ ] **Step 4: Full test + lint** — `npm test && npm run lint` — Expected: all pass.

- [ ] **Step 5: Commit** — `git commit -am "docs(automod): README + help for v2 pipeline, packs, re2 limits, dry-run"`

---

## Self-Review

**Spec coverage:**
- §5 Extract → Task 6. §6 Normalize + confusables → Tasks 2, 4, 5. §7 Evaluate (re2, caps, budget, sanity, URL) → Tasks 1, 7, 9, 13, 14. §8 Score/Heat → Tasks 8, 15. §9 Act (7 actions, dry-run, exemptions, DM, logs) → Tasks 16, 19. §10 Packs + feed → Tasks 11, 12, 20, 24. §11 Data model → Tasks 3, 18. §12 Command surface (panel/rules/test/packs/exempt/logs) → Tasks 22–26. §13 Error handling → Tasks 9, 14, 19 (self-heal), 12 (feed). §14 Testing → every task is TDD. §15 re2 risk → Task 1 gate. §16 Migration/native → Tasks 3, 20.
- Gap check: `exempt` subcommand — handled by opening the panel on the exempt selects (Task 26); no separate command file needed since exemptions live in the panel already. Covered.

**Placeholder scan:** Task 22's first test contains illustrative dead lines (`const msg = ...`) — Step 5 explicitly instructs replacing them with real `interaction.reply` assertions. No other TODO/TBD/"handle edge cases" placeholders.

**Type consistency:** `Hit = { source, weight, deleteOnHit, dryRun }` consistent across Tasks 14/15/19. `analyzeUrls(...)→{kind,host,weight}` mapped to `source: url:${kind}` in Task 14. `runPipeline` return shape (`{hits, dryRunHits, memberAction, heatAfter, disabled}`) consumed consistently in Task 19. `validatePattern`→`{ok, re|error}` used in Tasks 9/22/23. `HeatService` signatures identical in Tasks 8/15/17. Pack rule id convention `packId#index` used in Tasks 19 (skip persist-disable) consistently.

**Notes for the implementer:**
- Confirm `src/lib/embeds.js` exports (`errorEmbed`, `successEmbed`, `infoEmbed`) and their signatures before Tasks 22–25; adjust title args to match.
- Confirm `src/core/Scheduler.js`'s method name in Task 21 and back-patch `feed/refresh.js`.
- The migration (Task 3) is the one irreversible step — run it against a copy first.
