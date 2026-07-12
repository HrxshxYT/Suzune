# Anti-Nuke & Audit-Log Interactive Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/antinuke` and `/auditlog` subcommand flows with two single-message interactive control panels (buttons + native selects) where every setting is adjustable in place.

**Architecture:** Each panel is a stateful collector loop. A generic `runPanel` runner (in `src/lib/panel.js`) renders a payload from a mutable `state`, awaits a component interaction (owner-filtered), dispatches it to a `handle` function that persists the change and mutates `state`, then re-renders. Render functions are pure (`state → { embeds, components }`) and unit-tested; handlers persist via the existing `ConfigService`.

**Tech Stack:** Node ESM, discord.js v14.16, Prisma/Postgres (`ConfigService`), Vitest.

## Global Constraints

- Discord allows **max 5 action rows per message**; every panel view must fit in ≤5 rows.
- A slash command that owns subcommands is **not directly invokable** — `/antinuke` and `/auditlog` become bare commands with **no** subcommands.
- Both commands stay admin-gated: `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)` and `permissions: [PermissionFlagsBits.Administrator]`.
- Component collectors are owner-filtered via the existing `ownerFilter` (`src/lib/components.js`); custom-ids carry an `:<ownerId>` suffix.
- Tests inject the await function via `ctx.awaitFn` (existing pattern in `runToggler`); production uses the default.
- Panels reply **ephemeral** (`ephemeral: true`).
- ESM imports only; match existing file style (2-space indent, double quotes).
- discord.js `ComponentType`: Button=2, StringSelect=3, RoleSelect=6, MentionableSelect=7, ChannelSelect=8.

---

### Task 1: Generic `awaitComponent` + broaden the interaction guard

**Files:**
- Modify: `src/lib/collect.js`
- Modify: `src/modules/util/events/interactionCreate.js:22`
- Test: `test/lib/collect.test.js` (create)

**Interfaces:**
- Produces: `awaitComponent({ message, ownerId, timeMs }) → Promise<ComponentInteraction|null>` — awaits **any** message component (button or any select), owner-filtered, returns `null` on timeout.

- [ ] **Step 1: Write the failing test**

Create `test/lib/collect.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { awaitComponent, disableAll } from "../../src/lib/collect.js";

describe("awaitComponent", () => {
  it("resolves with the component the owner clicks", async () => {
    const click = { customId: "x", user: { id: "owner1" } };
    const message = { awaitMessageComponent: vi.fn(async () => click) };
    const res = await awaitComponent({ message, ownerId: "owner1", timeMs: 1000 });
    expect(res).toBe(click);
    // no componentType restriction -> selects are allowed too
    const arg = message.awaitMessageComponent.mock.calls[0][0];
    expect(arg.componentType).toBeUndefined();
    expect(arg.time).toBe(1000);
  });

  it("returns null on timeout", async () => {
    const message = {
      awaitMessageComponent: vi.fn(async () => {
        throw new Error("timeout");
      }),
    };
    expect(await awaitComponent({ message, ownerId: "o", timeMs: 5 })).toBeNull();
  });
});

describe("disableAll", () => {
  it("disables every component in every row", () => {
    const comp = { setDisabled: vi.fn(function () { return this; }) };
    const rows = [{ components: [comp] }];
    disableAll(rows);
    expect(comp.setDisabled).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/collect.test.js`
Expected: FAIL — `awaitComponent` is not exported.

- [ ] **Step 3: Add `awaitComponent` to `src/lib/collect.js`**

Add this export (keep existing `awaitButton` and `disableAll`):

```js
// Awaits any message component (button OR select menu) from the owner.
export async function awaitComponent({ message, ownerId, timeMs = 120000 }) {
  try {
    return await message.awaitMessageComponent({
      time: timeMs,
      filter: (i) => ownerFilter(i, ownerId),
    });
  } catch {
    return null; // timeout / no interaction
  }
}
```

- [ ] **Step 4: Broaden the global interaction guard**

In `src/modules/util/events/interactionCreate.js`, replace line 22:

```js
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) return;
```

with:

```js
    // All message components (buttons + every select) and modal submits are
    // owned by per-message collectors inside commands, never the global router.
    if (interaction.isMessageComponent?.() || interaction.isModalSubmit?.()) return;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/lib/collect.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/collect.js src/modules/util/events/interactionCreate.js test/lib/collect.test.js
git commit -m "feat(lib): awaitComponent for any component + broaden interaction guard"
```

---

### Task 2: `runPanel` runner

**Files:**
- Create: `src/lib/panel.js`
- Test: `test/lib/panel.test.js`

**Interfaces:**
- Consumes: `awaitComponent`, `disableAll` from `src/lib/collect.js`.
- Produces: `runPanel({ interaction, ownerId, render, handle, awaitFn?, timeMs? }) → Promise<void>`.
  - `render()` → `{ embeds, components }` (called fresh each iteration; reads external mutable state).
  - `handle(interaction, render) → "update" | "close" | "handled"`. `"update"` → runner calls `interaction.update(render())`; `"close"` → runner disables components and exits; `"handled"` → runner does nothing (handler already responded, e.g. opened a modal).

- [ ] **Step 1: Write the failing test**

Create `test/lib/panel.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { runPanel } from "../../src/lib/panel.js";

function interactionMock() {
  return {
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("runPanel", () => {
  it("replies ephemeral, updates on each 'update', and disables on 'close'", async () => {
    const interaction = interactionMock();
    const state = { n: 0 };
    const render = () => ({ embeds: [{ n: state.n }], components: [{ components: [] }] });
    const clicks = [
      { customId: "inc", update: vi.fn(async () => {}) },
      { customId: "close", update: vi.fn(async () => {}) },
    ];
    let idx = 0;
    const awaitFn = vi.fn(async () => clicks[idx++] ?? null);
    const handle = (i) => {
      if (i.customId === "close") return "close";
      state.n += 1;
      return "update";
    };

    await runPanel({ interaction, ownerId: "o", render, handle, awaitFn });

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, embeds: [{ n: 0 }] }),
    );
    expect(clicks[0].update).toHaveBeenCalledWith(expect.objectContaining({ embeds: [{ n: 1 }] }));
    // close click disables components (setDisabled path handled by disableAll)
    expect(clicks[1].update).toHaveBeenCalled();
  });

  it("does nothing extra on 'handled' and disables on timeout", async () => {
    const interaction = interactionMock();
    const render = () => ({ embeds: [{}], components: [{ components: [] }] });
    const clicks = [{ customId: "modal", update: vi.fn(async () => {}) }];
    let idx = 0;
    const awaitFn = vi.fn(async () => clicks[idx++] ?? null); // then null => timeout
    const handle = () => "handled";

    await runPanel({ interaction, ownerId: "o", render, handle, awaitFn });

    expect(clicks[0].update).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled(); // timeout disable
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/panel.test.js`
Expected: FAIL — cannot import `runPanel`.

- [ ] **Step 3: Implement `src/lib/panel.js`**

```js
import { awaitComponent, disableAll } from "./collect.js";

// Stateful control-panel loop. `render()` returns the current payload from
// external mutable state; `handle` persists a click and returns a directive.
export async function runPanel({
  interaction,
  ownerId,
  render,
  handle,
  awaitFn = awaitComponent,
  timeMs = 150000,
}) {
  await interaction.reply({ ...render(), ephemeral: true });
  const message = await interaction.fetchReply();

  for (;;) {
    const i = await awaitFn({ message, ownerId, timeMs });
    if (!i) break;

    const directive = await handle(i, render);

    if (directive === "close") {
      await i.update({ components: disableAll(render().components) }).catch(() => {});
      return;
    }
    if (directive === "handled") continue; // handler already responded to `i`
    await i.update(render()).catch(() => {});
  }

  await interaction
    .editReply({ components: disableAll(render().components) })
    .catch(() => {});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/panel.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/panel.js test/lib/panel.test.js
git commit -m "feat(lib): runPanel stateful control-panel runner"
```

---

### Task 3: Anti-nuke panel render (pure views)

**Files:**
- Create: `src/modules/antinuke/panel/render.js`
- Test: `test/modules/antinuke/panelRender.test.js`

**Interfaces:**
- Consumes: `buildWhitelistEmbed(whitelist)` from `src/modules/antinuke/statusEmbed.js`; `COLORS`, `EMOJIS` from `src/lib/constants.js`.
- State shape: `{ guildId, guild, ownerId, view, antinuke: {enabled,panicMode,autoRevert,antiRaidEnabled,punishment,alertChannelId,quarantineRoleId,raidJoinCount,raidWindowSec}, whitelist: [{targetId,type}] }`.
- Produces:
  - `PUNISHMENTS: [value, label][]`
  - `buildMainView(state) → { embeds, components }` (5 rows)
  - `buildWhitelistView(state) → { embeds, components }` (≤4 rows)

- [ ] **Step 1: Write the failing test**

Create `test/modules/antinuke/panelRender.test.js`:

```js
import { describe, it, expect } from "vitest";
import { buildMainView, buildWhitelistView } from "../../../src/modules/antinuke/panel/render.js";

const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  view: "main",
  antinuke: { enabled: true, panicMode: false, autoRevert: true, antiRaidEnabled: false, punishment: "ban" },
  whitelist: [{ targetId: "u1", type: "user" }, { targetId: "r1", type: "role" }],
  ...over,
});

describe("buildMainView", () => {
  it("renders exactly 5 rows with the expected custom ids", () => {
    const { components } = buildMainView(state());
    expect(components).toHaveLength(5);
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("an:tog:enabled:o1");
    expect(ids).toContain("an:sel:punishment:o1");
    expect(ids).toContain("an:sel:alert:o1");
    expect(ids).toContain("an:sel:qrole:o1");
    expect(ids).toContain("an:adv:o1");
    expect(ids).toContain("an:wl:open:o1");
    expect(ids).toContain("an:close:o1");
  });

  it("shows the enabled toggle as green (Success=3) when on", () => {
    const btn = buildMainView(state()).components[0].components[0];
    expect(btn.data.style).toBe(3);
  });

  it("reflects whitelist count and punishment in the embed", () => {
    const json = JSON.stringify(buildMainView(state()).embeds[0].data);
    expect(json).toContain("Whitelist: 2");
    expect(json).toContain("ban");
  });
});

describe("buildWhitelistView", () => {
  it("lists entries and offers add/remove/back/close", () => {
    const { embeds, components } = buildWhitelistView(state({ view: "whitelist" }));
    expect(JSON.stringify(embeds[0].data)).toContain("<@u1>");
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("an:wl:add:o1");
    expect(ids).toContain("an:wl:remove:o1");
    expect(ids).toContain("an:wl:back:o1");
  });

  it("omits the remove select when the whitelist is empty", () => {
    const ids = buildWhitelistView(state({ view: "whitelist", whitelist: [] }))
      .components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).not.toContain("an:wl:remove:o1");
    expect(ids).toContain("an:wl:add:o1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/antinuke/panelRender.test.js`
Expected: FAIL — cannot import from `panel/render.js`.

- [ ] **Step 3: Implement `src/modules/antinuke/panel/render.js`**

```js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";
import { buildWhitelistEmbed } from "../statusEmbed.js";

export const PUNISHMENTS = [
  ["ban", "Ban"],
  ["kick", "Kick"],
  ["strip", "Strip roles"],
  ["quarantine", "Quarantine"],
  ["removeperms", "Remove perms"],
];

export function buildMainView(state) {
  const a = state.antinuke;
  const o = state.ownerId;

  const embed = new EmbedBuilder()
    .setColor(a.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🛡️ Anti-Nuke Control Panel")
    .setDescription(
      `${a.enabled ? "🟢 ON" : "🔴 OFF"} · Punish: \`${a.punishment ?? "ban"}\`\n` +
        `Alert: ${a.alertChannelId ? `<#${a.alertChannelId}>` : "*none*"} · ` +
        `Quarantine: ${a.quarantineRoleId ? `<@&${a.quarantineRoleId}>` : "*none*"}\n` +
        `Anti-raid: ${
          a.antiRaidEnabled ? `on (${a.raidJoinCount ?? 10} joins / ${a.raidWindowSec ?? 10}s)` : "off"
        } · Whitelist: ${state.whitelist.length}`,
    );

  const toggle = (field, label) =>
    new ButtonBuilder()
      .setCustomId(`an:tog:${field}:${o}`)
      .setLabel(`${a[field] ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(a[field] ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    toggle("enabled", "Enabled"),
    toggle("panicMode", "Panic"),
    toggle("autoRevert", "Auto-revert"),
    toggle("antiRaidEnabled", "Anti-raid"),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`an:sel:punishment:${o}`)
      .setPlaceholder("Punishment on detection")
      .addOptions(
        PUNISHMENTS.map(([value, label]) => ({
          label,
          value,
          default: (a.punishment ?? "ban") === value,
        })),
      ),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`an:sel:alert:${o}`)
      .setPlaceholder("Alert channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`an:sel:qrole:${o}`)
      .setPlaceholder("Quarantine role")
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`an:adv:${o}`).setLabel("Advanced…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`an:wl:open:${o}`).setLabel("Whitelist").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`an:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

export function buildWhitelistView(state) {
  const o = state.ownerId;
  const embed = buildWhitelistEmbed(state.whitelist);

  const rows = [
    new ActionRowBuilder().addComponents(
      new MentionableSelectMenuBuilder()
        .setCustomId(`an:wl:add:${o}`)
        .setPlaceholder("Add a user or role…")
        .setMinValues(1)
        .setMaxValues(1),
    ),
  ];

  if (state.whitelist.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`an:wl:remove:${o}`)
          .setPlaceholder("Remove an entry…")
          .addOptions(
            state.whitelist.slice(0, 25).map((e) => ({
              label: `${e.type === "role" ? "Role" : "User"} ${e.targetId}`,
              value: e.targetId,
            })),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`an:wl:back:${o}`).setLabel("◀ Back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`an:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
    ),
  );

  return { embeds: [embed], components: rows };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/modules/antinuke/panelRender.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/panel/render.js test/modules/antinuke/panelRender.test.js
git commit -m "feat(antinuke): pure render for control-panel main + whitelist views"
```

---

### Task 4: Anti-nuke panel handlers (toggles, selects, whitelist, advanced modal)

**Files:**
- Create: `src/modules/antinuke/panel/handlers.js`
- Test: `test/modules/antinuke/panelHandlers.test.js`

**Interfaces:**
- Consumes: `ctx.config.updateAntinuke/addWhitelist/removeWhitelist`; `errorEmbed` from `src/lib/embeds.js`; discord.js `ModalBuilder/TextInputBuilder/TextInputStyle/ActionRowBuilder`.
- Produces: `handleAntinukeComponent(interaction, state, ctx, render) → "update" | "close" | "handled"`. Mutates `state` in place and persists.

- [ ] **Step 1: Write the failing test**

Create `test/modules/antinuke/panelHandlers.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { handleAntinukeComponent } from "../../../src/modules/antinuke/panel/handlers.js";

const ctx = () => ({
  config: {
    updateAntinuke: vi.fn(async () => ({})),
    addWhitelist: vi.fn(async () => ({})),
    removeWhitelist: vi.fn(async () => {}),
  },
});
const baseState = () => ({
  guildId: "g1",
  ownerId: "o1",
  view: "main",
  antinuke: { enabled: false, autoRevert: true, punishment: "ban" },
  whitelist: [],
});
const render = () => ({ embeds: [], components: [] });

describe("handleAntinukeComponent", () => {
  it("toggles a boolean field and persists it", async () => {
    const c = ctx();
    const state = baseState();
    const dir = await handleAntinukeComponent(
      { customId: "an:tog:enabled:o1", user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(dir).toBe("update");
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { enabled: true });
    expect(state.antinuke.enabled).toBe(true);
  });

  it("sets punishment from a string select", async () => {
    const c = ctx();
    const state = baseState();
    await handleAntinukeComponent(
      { customId: "an:sel:punishment:o1", values: ["kick"], user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { punishment: "kick" });
    expect(state.antinuke.punishment).toBe("kick");
  });

  it("sets the alert channel from a channel select", async () => {
    const c = ctx();
    const state = baseState();
    await handleAntinukeComponent(
      { customId: "an:sel:alert:o1", values: ["c9"], user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { alertChannelId: "c9" });
  });

  it("navigates to the whitelist view and back", async () => {
    const state = baseState();
    await handleAntinukeComponent({ customId: "an:wl:open:o1", user: { id: "o1" } }, state, ctx(), render);
    expect(state.view).toBe("whitelist");
    await handleAntinukeComponent({ customId: "an:wl:back:o1", user: { id: "o1" } }, state, ctx(), render);
    expect(state.view).toBe("main");
  });

  it("adds a role to the whitelist with type 'role'", async () => {
    const c = ctx();
    const state = baseState();
    const roles = new Map([["r5", {}]]);
    await handleAntinukeComponent(
      { customId: "an:wl:add:o1", values: ["r5"], roles: { has: (id) => roles.has(id) }, user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.addWhitelist).toHaveBeenCalledWith("g1", "r5", "role", "o1");
    expect(state.whitelist).toEqual([{ targetId: "r5", type: "role" }]);
  });

  it("adds a user to the whitelist with type 'user'", async () => {
    const c = ctx();
    const state = baseState();
    await handleAntinukeComponent(
      { customId: "an:wl:add:o1", values: ["u5"], roles: { has: () => false }, user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.addWhitelist).toHaveBeenCalledWith("g1", "u5", "user", "o1");
  });

  it("removes a whitelist entry", async () => {
    const c = ctx();
    const state = { ...baseState(), whitelist: [{ targetId: "u5", type: "user" }] };
    await handleAntinukeComponent(
      { customId: "an:wl:remove:o1", values: ["u5"], user: { id: "o1" } },
      state,
      c,
      render,
    );
    expect(c.config.removeWhitelist).toHaveBeenCalledWith("g1", "u5");
    expect(state.whitelist).toEqual([]);
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleAntinukeComponent(
      { customId: "an:close:o1", user: { id: "o1" } },
      baseState(),
      ctx(),
      render,
    );
    expect(dir).toBe("close");
  });

  it("persists valid advanced-modal numbers and updates the panel", async () => {
    const c = ctx();
    const state = baseState();
    const sub = {
      fields: { getTextInputValue: (k) => (k === "raidJoinCount" ? "8" : "15") },
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };
    const i = {
      customId: "an:adv:o1",
      user: { id: "o1" },
      showModal: vi.fn(async () => {}),
      awaitModalSubmit: vi.fn(async () => sub),
    };
    const dir = await handleAntinukeComponent(i, state, c, render);
    expect(i.showModal).toHaveBeenCalled();
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { raidJoinCount: 8, raidWindowSec: 15 });
    expect(sub.update).toHaveBeenCalled();
    expect(dir).toBe("handled");
  });

  it("rejects invalid advanced-modal input without persisting", async () => {
    const c = ctx();
    const sub = {
      fields: { getTextInputValue: () => "abc" },
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };
    const i = {
      customId: "an:adv:o1",
      user: { id: "o1" },
      showModal: vi.fn(async () => {}),
      awaitModalSubmit: vi.fn(async () => sub),
    };
    const dir = await handleAntinukeComponent(i, baseState(), c, render);
    expect(c.config.updateAntinuke).not.toHaveBeenCalled();
    expect(sub.reply).toHaveBeenCalled();
    expect(dir).toBe("handled");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/antinuke/panelHandlers.test.js`
Expected: FAIL — cannot import `handleAntinukeComponent`.

- [ ] **Step 3: Implement `src/modules/antinuke/panel/handlers.js`**

```js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";

async function openAdvancedModal(i, state, ctx, render) {
  const a = state.antinuke;
  const modalId = `an:advmodal:${i.user.id}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Anti-raid settings");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("raidJoinCount")
        .setLabel("Raid join count (joins to trigger)")
        .setStyle(TextInputStyle.Short)
        .setValue(String(a.raidJoinCount ?? 10))
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("raidWindowSec")
        .setLabel("Raid window (seconds)")
        .setStyle(TextInputStyle.Short)
        .setValue(String(a.raidWindowSec ?? 10))
        .setRequired(true),
    ),
  );

  await i.showModal(modal);

  let sub;
  try {
    sub = await i.awaitModalSubmit({
      time: 120000,
      filter: (m) => m.customId === modalId && m.user.id === i.user.id,
    });
  } catch {
    return "handled"; // modal timed out / dismissed
  }

  const count = Number(sub.fields.getTextInputValue("raidJoinCount"));
  const win = Number(sub.fields.getTextInputValue("raidWindowSec"));
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(win) || win < 1) {
    await sub.reply({
      embeds: [errorEmbed("Both values must be positive whole numbers.")],
      ephemeral: true,
    });
    return "handled";
  }

  await ctx.config.updateAntinuke(state.guildId, { raidJoinCount: count, raidWindowSec: win });
  state.antinuke.raidJoinCount = count;
  state.antinuke.raidWindowSec = win;
  await sub.update(render());
  return "handled";
}

export async function handleAntinukeComponent(i, state, ctx, render) {
  const [, kind, arg] = i.customId.split(":");

  if (kind === "close") return "close";

  if (kind === "tog") {
    const next = !state.antinuke[arg];
    await ctx.config.updateAntinuke(state.guildId, { [arg]: next });
    state.antinuke[arg] = next;
    return "update";
  }

  if (kind === "sel") {
    const value = i.values[0];
    const field =
      arg === "punishment" ? "punishment" : arg === "alert" ? "alertChannelId" : "quarantineRoleId";
    await ctx.config.updateAntinuke(state.guildId, { [field]: value });
    state.antinuke[field] = value;
    return "update";
  }

  if (kind === "adv") {
    return openAdvancedModal(i, state, ctx, render);
  }

  if (kind === "wl") {
    if (arg === "open") {
      state.view = "whitelist";
      return "update";
    }
    if (arg === "back") {
      state.view = "main";
      return "update";
    }
    if (arg === "add") {
      const targetId = i.values[0];
      const type = i.roles?.has?.(targetId) ? "role" : "user";
      await ctx.config.addWhitelist(state.guildId, targetId, type, i.user.id);
      state.whitelist = [
        ...state.whitelist.filter((e) => e.targetId !== targetId),
        { targetId, type },
      ];
      return "update";
    }
    if (arg === "remove") {
      const targetId = i.values[0];
      await ctx.config.removeWhitelist(state.guildId, targetId);
      state.whitelist = state.whitelist.filter((e) => e.targetId !== targetId);
      return "update";
    }
  }

  return "update";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/modules/antinuke/panelHandlers.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/antinuke/panel/handlers.js test/modules/antinuke/panelHandlers.test.js
git commit -m "feat(antinuke): panel component handlers (toggles/selects/whitelist/advanced)"
```

---

### Task 5: Wire anti-nuke panel into the command

**Files:**
- Create: `src/modules/antinuke/panel/index.js`
- Modify: `src/modules/antinuke/commands/antinuke.js` (full rewrite to bare command)
- Modify: `src/modules/antinuke/statusEmbed.js` (remove now-unused `buildStatusEmbed`)
- Test: `test/modules/antinuke/antinukeCommand.test.js` (rewrite)

**Interfaces:**
- Consumes: `buildMainView`/`buildWhitelistView` (Task 3), `handleAntinukeComponent` (Task 4), `runPanel` (Task 2).
- Produces: `runAntinukePanel(interaction, ctx) → Promise<void>`; default-export command with `data.name === "antinuke"`, no subcommands.

- [ ] **Step 1: Implement `src/modules/antinuke/panel/index.js`**

```js
import { runPanel } from "../../../lib/panel.js";
import { buildMainView, buildWhitelistView } from "./render.js";
import { handleAntinukeComponent } from "./handlers.js";

export async function runAntinukePanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    guild: interaction.guild,
    ownerId: interaction.user.id,
    view: "main",
    antinuke: { ...(gc.antinuke ?? {}) },
    whitelist: [...(gc.whitelist ?? [])],
  };
  const render = () => (state.view === "whitelist" ? buildWhitelistView(state) : buildMainView(state));

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleAntinukeComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
```

- [ ] **Step 2: Rewrite `src/modules/antinuke/commands/antinuke.js`**

Replace the entire file with:

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runAntinukePanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Open the anti-nuke control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runAntinukePanel(interaction, ctx),
};
```

- [ ] **Step 3: Remove the now-unused `buildStatusEmbed`**

In `src/modules/antinuke/statusEmbed.js`, delete the `buildStatusEmbed` function (lines 4–18) and its now-unused imports if any become unused. Keep `buildWhitelistEmbed`, `mentionList`, and the `LIMITS`/`COLORS` imports (still used by `buildWhitelistEmbed`).

- [ ] **Step 4: Rewrite `test/modules/antinuke/antinukeCommand.test.js`**

Replace the entire file with:

```js
import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/antinuke/commands/antinuke.js";
import { buildWhitelistEmbed } from "../../../src/modules/antinuke/statusEmbed.js";

function ctx() {
  return {
    config: {
      updateAntinuke: vi.fn(async () => ({})),
      addWhitelist: vi.fn(async () => ({})),
      removeWhitelist: vi.fn(async () => {}),
      getGuild: vi.fn(async () => ({
        antinuke: { enabled: false, punishment: "ban", autoRevert: true },
        whitelist: [],
      })),
    },
    logger: { info: vi.fn(), error: vi.fn() },
  };
}

function interaction() {
  return {
    guildId: "g1",
    guild: { id: "g1" },
    user: { id: "admin1" },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("/antinuke command", () => {
  it("is admin-gated, named, and has no subcommands", () => {
    expect(command.data.name).toBe("antinuke");
    expect(command.permissions.length).toBe(1);
    expect(command.data.options ?? []).toHaveLength(0);
  });

  it("opens the panel (ephemeral reply) and toggles enabled on click", async () => {
    const c = ctx();
    const click = { customId: "an:tog:enabled:admin1", user: { id: "admin1" }, update: vi.fn(async () => {}) };
    let n = 0;
    c.awaitFn = vi.fn(async () => (n++ === 0 ? click : null));
    await command.execute(interaction(), c);
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { enabled: true });
  });
});

describe("buildWhitelistEmbed", () => {
  it("mentions whitelisted users and roles", () => {
    const e = buildWhitelistEmbed([{ targetId: "u1", type: "user" }, { targetId: "r1", type: "role" }]);
    const json = JSON.stringify(e.data);
    expect(json).toContain("<@u1>");
    expect(json).toContain("<@&r1>");
  });
});
```

- [ ] **Step 5: Run the anti-nuke suite**

Run: `npx vitest run test/modules/antinuke/`
Expected: PASS (all files, including render/handlers/command).

- [ ] **Step 6: Commit**

```bash
git add src/modules/antinuke/panel/index.js src/modules/antinuke/commands/antinuke.js src/modules/antinuke/statusEmbed.js test/modules/antinuke/antinukeCommand.test.js
git commit -m "feat(antinuke): replace subcommands with interactive control panel"
```

---

### Task 6: Audit-log panel render + short category labels

**Files:**
- Modify: `src/modules/audit/categories.js` (add `btn` short labels + export `isOn`)
- Create: `src/modules/audit/panel/render.js`
- Test: `test/modules/audit/panelRender.test.js`

**Interfaces:**
- Produces:
  - `categories.js`: `isOn(audit, key) → boolean` (`audit?.events?.[key] !== false`); each `CATEGORIES[i]` gains `btn` (short label).
  - `render.js`: `buildAuditView(audit, ownerId) → { embeds, components }` (5 rows).

- [ ] **Step 1: Write the failing test**

Create `test/modules/audit/panelRender.test.js`:

```js
import { describe, it, expect } from "vitest";
import { buildAuditView } from "../../../src/modules/audit/panel/render.js";
import { CATEGORIES } from "../../../src/modules/audit/categories.js";

describe("buildAuditView", () => {
  it("fits in 5 rows and exposes channel/all/disable/close ids", () => {
    const { components } = buildAuditView({ enabled: true, channelId: "c1", events: {} }, "o1");
    expect(components.length).toBeLessThanOrEqual(5);
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("au:chan:o1");
    expect(ids).toContain("au:all:on:o1");
    expect(ids).toContain("au:all:off:o1");
    expect(ids).toContain("au:disable:o1");
    expect(ids).toContain("au:close:o1");
  });

  it("has one toggle button per category", () => {
    const ids = buildAuditView({ enabled: true, events: {} }, "o1")
      .components.flatMap((r) => r.components.map((c) => c.data.custom_id))
      .filter((id) => id.startsWith("au:cat:"));
    expect(ids).toHaveLength(CATEGORIES.length);
  });

  it("renders a category as grey (Secondary=2) when explicitly off", () => {
    const { components } = buildAuditView({ enabled: true, events: { members: false } }, "o1");
    const btn = components
      .flatMap((r) => r.components)
      .find((c) => c.data.custom_id === "au:cat:members:o1");
    expect(btn.data.style).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/audit/panelRender.test.js`
Expected: FAIL — cannot import `buildAuditView`.

- [ ] **Step 3: Update `src/modules/audit/categories.js`**

Replace the file with (adds `btn` + `isOn`, keeps existing exports):

```js
export const CATEGORIES = [
  { key: "members", label: "Member join/leave", btn: "Members" },
  { key: "memberEdits", label: "Member edits (nick/roles/timeout)", btn: "Member edits" },
  { key: "bans", label: "Bans & unbans", btn: "Bans" },
  { key: "messages", label: "Message edits/deletes", btn: "Messages" },
  { key: "channels", label: "Channel changes", btn: "Channels" },
  { key: "roles", label: "Role changes", btn: "Roles" },
  { key: "server", label: "Server settings", btn: "Server" },
  { key: "emojis", label: "Emojis & stickers", btn: "Emojis" },
  { key: "threads", label: "Threads", btn: "Threads" },
  { key: "voice", label: "Voice activity", btn: "Voice" },
  { key: "invites", label: "Invites", btn: "Invites" },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

// A category is tracked unless explicitly disabled (missing key defaults on).
export function isOn(audit, key) {
  return audit?.events?.[key] !== false;
}
```

- [ ] **Step 4: Implement `src/modules/audit/panel/render.js`**

```js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";
import { CATEGORIES, isOn } from "../categories.js";

export function buildAuditView(audit, ownerId) {
  const o = ownerId;
  const enabled = !!audit?.enabled;

  const embed = new EmbedBuilder()
    .setColor(enabled ? COLORS.success : COLORS.warn)
    .setTitle("📋 Audit Log Control Panel")
    .setDescription(
      `Status: ${enabled ? "🟢 ON" : "🔴 OFF"} · ` +
        `Channel: ${audit?.channelId ? `<#${audit.channelId}>` : "*not set*"}`,
    );

  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`au:chan:${o}`)
      .setPlaceholder("Log channel (setting it enables the feed)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const catButtons = CATEGORIES.map((c) =>
    new ButtonBuilder()
      .setCustomId(`au:cat:${c.key}:${o}`)
      .setLabel(`${isOn(audit, c.key) ? EMOJIS.on : EMOJIS.off} ${c.btn ?? c.label}`)
      .setStyle(isOn(audit, c.key) ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  // Chunk category buttons into rows of 5. With 11 categories that is [5,5,1];
  // append the All on/off buttons to the last (short) category row.
  const catRows = [];
  for (let i = 0; i < catButtons.length; i += 5) {
    catRows.push(catButtons.slice(i, i + 5));
  }
  const lastRow = catRows[catRows.length - 1];
  lastRow.push(
    new ButtonBuilder().setCustomId(`au:all:on:${o}`).setLabel("All on").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`au:all:off:${o}`).setLabel("All off").setStyle(ButtonStyle.Secondary),
  );

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`au:disable:${o}`)
      .setLabel("🔴 Disable feed")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`au:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Secondary),
  );

  const components = [
    channelRow,
    ...catRows.map((btns) => new ActionRowBuilder().addComponents(...btns)),
    controlRow,
  ];
  return { embeds: [embed], components };
}
```

Note: 11 categories → `[5,5,1]` + 2 all-buttons on the last row = 3 category rows; total rows = 1 (channel) + 3 + 1 (control) = 5. If `CATEGORIES` ever grows past 13, the last row would exceed 5 buttons — keep categories ≤13.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/modules/audit/panelRender.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/audit/categories.js src/modules/audit/panel/render.js test/modules/audit/panelRender.test.js
git commit -m "feat(audit): short category labels, shared isOn, panel render"
```

---

### Task 7: Audit panel handlers + wire into the command

**Files:**
- Create: `src/modules/audit/panel/handlers.js`
- Create: `src/modules/audit/panel/index.js`
- Modify: `src/modules/audit/commands/auditlog.js` (full rewrite to bare command)
- Test: `test/modules/audit/panelHandlers.test.js` (create)
- Test: `test/modules/audit/auditlogCommand.test.js` (rewrite)

**Interfaces:**
- Produces:
  - `handleAuditComponent(interaction, state, ctx) → "update" | "close"`. State shape: `{ guildId, ownerId, audit: { enabled, channelId, events } }`.
  - `runAuditPanel(interaction, ctx) → Promise<void>`.

- [ ] **Step 1: Write the failing handler test**

Create `test/modules/audit/panelHandlers.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { handleAuditComponent } from "../../../src/modules/audit/panel/handlers.js";
import { CATEGORIES } from "../../../src/modules/audit/categories.js";

const ctx = () => ({ config: { updateAudit: vi.fn(async () => ({})) } });
const state = (over = {}) => ({ guildId: "g1", ownerId: "o1", audit: { enabled: true, events: {} }, ...over });

describe("handleAuditComponent", () => {
  it("sets the channel and enables the feed", async () => {
    const c = ctx();
    const s = state();
    const dir = await handleAuditComponent({ customId: "au:chan:o1", values: ["c9"] }, s, c);
    expect(dir).toBe("update");
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { enabled: true, channelId: "c9" });
    expect(s.audit.channelId).toBe("c9");
  });

  it("toggles a category off (on by default)", async () => {
    const c = ctx();
    await handleAuditComponent({ customId: "au:cat:members:o1" }, state(), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { events: { members: false } });
  });

  it("turns all categories on", async () => {
    const c = ctx();
    await handleAuditComponent({ customId: "au:all:on:o1" }, state(), c);
    const arg = c.config.updateAudit.mock.calls[0][1].events;
    expect(Object.keys(arg)).toHaveLength(CATEGORIES.length);
    expect(Object.values(arg).every((v) => v === true)).toBe(true);
  });

  it("disables the feed", async () => {
    const c = ctx();
    const dir = await handleAuditComponent({ customId: "au:disable:o1" }, state(), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { enabled: false });
    expect(dir).toBe("update");
  });

  it("returns 'close' for the close button", async () => {
    const dir = await handleAuditComponent({ customId: "au:close:o1" }, state(), ctx());
    expect(dir).toBe("close");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/audit/panelHandlers.test.js`
Expected: FAIL — cannot import `handleAuditComponent`.

- [ ] **Step 3: Implement `src/modules/audit/panel/handlers.js`**

```js
import { CATEGORIES, isOn } from "../categories.js";

export async function handleAuditComponent(i, state, ctx) {
  const parts = i.customId.split(":"); // au:<kind>[:<arg>]:<ownerId>
  const kind = parts[1];

  if (kind === "close") return "close";

  if (kind === "chan") {
    const channelId = i.values[0];
    await ctx.config.updateAudit(state.guildId, { enabled: true, channelId });
    state.audit.enabled = true;
    state.audit.channelId = channelId;
    return "update";
  }

  if (kind === "disable") {
    await ctx.config.updateAudit(state.guildId, { enabled: false });
    state.audit.enabled = false;
    return "update";
  }

  if (kind === "all") {
    const on = parts[2] === "on";
    const events = {};
    for (const c of CATEGORIES) events[c.key] = on;
    await ctx.config.updateAudit(state.guildId, { events });
    state.audit.events = events;
    return "update";
  }

  if (kind === "cat") {
    const key = parts[2];
    const events = { ...(state.audit.events ?? {}) };
    events[key] = !isOn(state.audit, key);
    await ctx.config.updateAudit(state.guildId, { events });
    state.audit.events = events;
    return "update";
  }

  return "update";
}
```

- [ ] **Step 4: Implement `src/modules/audit/panel/index.js`**

```js
import { runPanel } from "../../../lib/panel.js";
import { buildAuditView } from "./render.js";
import { handleAuditComponent } from "./handlers.js";

export async function runAuditPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    audit: { ...(gc.audit ?? { events: {} }) },
  };
  const render = () => buildAuditView(state.audit, state.ownerId);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i) => handleAuditComponent(i, state, ctx),
    awaitFn: ctx.awaitFn,
  });
}
```

- [ ] **Step 5: Rewrite `src/modules/audit/commands/auditlog.js`**

Replace the entire file with:

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runAuditPanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("auditlog")
    .setDescription("Open the audit-log control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runAuditPanel(interaction, ctx),
};
```

- [ ] **Step 6: Rewrite `test/modules/audit/auditlogCommand.test.js`**

Replace the entire file with:

```js
import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/audit/commands/auditlog.js";

function ctx(audit = { enabled: true, channelId: "c1", events: {} }) {
  return {
    config: {
      updateAudit: vi.fn(async () => ({})),
      getGuild: vi.fn(async () => ({ audit })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction() {
  return {
    guildId: "g1",
    user: { id: "admin1" },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("/auditlog command", () => {
  it("is admin-gated and has no subcommands", () => {
    expect(command.data.name).toBe("auditlog");
    expect(command.permissions.length).toBe(1);
    expect(command.data.options ?? []).toHaveLength(0);
  });

  it("opens the panel and toggles a category off on click", async () => {
    const c = ctx();
    const click = { customId: "au:cat:members:admin1", update: vi.fn(async () => {}) };
    let n = 0;
    c.awaitFn = vi.fn(async () => (n++ === 0 ? click : null));
    await command.execute(interaction(), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { events: { members: false } });
  });
});
```

- [ ] **Step 7: Run the audit suite**

Run: `npx vitest run test/modules/audit/`
Expected: PASS (all files).

- [ ] **Step 8: Commit**

```bash
git add src/modules/audit/panel/ src/modules/audit/commands/auditlog.js test/modules/audit/panelHandlers.test.js test/modules/audit/auditlogCommand.test.js
git commit -m "feat(audit): replace subcommands with interactive control panel"
```

---

### Task 8: Full verification + register commands note

**Files:**
- None (verification only)

- [ ] **Step 1: Run the entire suite**

Run: `npx vitest run`
Expected: PASS — all files. If the old `test/modules/antinuke/config.test.js` still passes (it tests `isWhitelisted`/`getThreshold`, unaffected), good.

- [ ] **Step 2: Lint**

Run: `npx eslint src/ test/`
Expected: exit 0. Fix any unused-import warnings (e.g. leftover imports in `statusEmbed.js`).

- [ ] **Step 3: Sanity-check the panels render without a live client**

Run:

```bash
node -e "
import('./src/modules/antinuke/panel/render.js').then(m=>{
  const v=m.buildMainView({ownerId:'o',view:'main',antinuke:{enabled:true,punishment:'ban'},whitelist:[]});
  console.log('antinuke rows', v.components.length);
});
import('./src/modules/audit/panel/render.js').then(m=>{
  const v=m.buildAuditView({enabled:true,events:{}},'o');
  console.log('audit rows', v.components.length);
});
"
```

Expected: `antinuke rows 5` and `audit rows 5` (≤5 each). If either exceeds 5, Discord will reject the message — revisit row chunking.

- [ ] **Step 4: Note on slash registration**

The command **shape** changed (subcommands removed). After deploy, run `npm run register` so Discord drops the old subcommands and registers the bare commands. Add this reminder to the PR description; no code change needed here.

- [ ] **Step 5: Commit (if lint fixes were made)**

```bash
git add -A
git commit -m "chore: lint fixes for panel work"
```

---

## Notes for the implementer

- **Ephemeral collectors:** `interaction.fetchReply()` works for ephemeral replies within the 15-minute token window; the 150s collector timeout is well inside it.
- **Modal-from-button:** a modal shown from a component interaction yields a `ModalSubmitInteraction` that can `.update()` the original message — that's why `openAdvancedModal` calls `sub.update(render())` and returns `"handled"` (the runner must NOT also call `i.update`, since `i` was consumed by `showModal`).
- **Do not** re-add subcommands to either command — that breaks the bare-command panel entry point (Global Constraints).
- The `whitelistview` subcommand added earlier in this branch is fully removed by the Task 5 rewrite; its behavior now lives in the panel's whitelist view.
