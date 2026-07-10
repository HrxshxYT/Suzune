# Phase 5 Config & Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver server configuration and discovery — `/config` (mod roles, DM-on-action, mute role, view, reset), `/logging` (per-category log channels + toggles), a dynamic `/help` with autocomplete, and the deferred role-based `/mute` + `/unmute`.

**Architecture:** New `ConfigService` methods persist mod roles, logging config, and the mute role. Commands are auto-discovered and tagged with their module folder as `category`; `/help` groups by that category and offers command-name autocomplete (routed through an extended interaction handler). `/mute`/`/unmute` use a configured mute role and record cases like the rest of moderation.

**Tech Stack:** Node.js 25 (ESM), discord.js v14 (`SlashCommandBuilder`, `PermissionFlagsBits`, `EmbedBuilder`, `Events`), Prisma (`Guild.muteRoleId`, `LoggingConfig`, `ModRole`), Vitest.

## Global Constraints

- **Node.js 25**, ES modules only; discord.js v14 API surface only.
- **Reuse:** `successEmbed`/`errorEmbed`/`infoEmbed`, `COLORS`, `ConfigService`, `checkHierarchy`/`buildCaseEmbed` (moderation helpers), `LOGGING category keys` (`memberJoinLeave`, `messageEdit`, `messageDelete`, `modActions`, `roleChanges`, `channelChanges`, `voice`, `serverChanges`).
- **New commands live in `src/modules/config/` and `src/modules/moderation/commands/`** and are auto-discovered.
- **Never throw out of a command;** reply with an ephemeral error embed on failure.
- **Tests:** Vitest, `*.test.js` under `test/` mirroring `src/`. Run one file with `npx vitest run <path>`.
- **Commit** after each task's tests pass (`feat(config): ...` / `feat(mod): ...`).
- After schema changes, run `npx prisma generate` and regenerate the offline SQL (Task 1) — do not require a live DB.

---

### Task 1: Schema (mute role) + ConfigService config methods

**Files:**
- Modify: `prisma/schema.prisma` (add `muteRoleId` to `Guild`)
- Modify: `prisma/migrations/manual_init.sql` (regenerate)
- Modify: `src/core/ConfigService.js`
- Test: `test/core/ConfigService.config.test.js`

**Interfaces:**
- Consumes: injected Prisma-like client with `loggingConfig.upsert`, `modRole.upsert`, `modRole.deleteMany`, `antinukeConfig.deleteMany`, `loggingConfig.deleteMany`, `whitelist.deleteMany`, `guild.update`, plus existing methods.
- Produces (added to `ConfigService`):
  - `async updateLogging(guildId, data): row` — upserts `LoggingConfig`, invalidates cache.
  - `async addModRole(guildId, roleId): row` — upserts a `ModRole`, invalidates cache.
  - `async removeModRole(guildId, roleId): void` — deletes matching `ModRole`, invalidates cache.
  - `async resetGuildConfig(guildId): void` — deletes anti-nuke/logging/mod-role/whitelist rows and resets `Guild` flags (`dmOnAction=true`, `muteRoleId=null`, `modLogEnabled=false`), invalidates cache.
  - (Mute role and DM toggle reuse the existing `updateGuild(guildId, { muteRoleId } | { dmOnAction })`.)

- [ ] **Step 1: Add `muteRoleId` to the `Guild` model in `prisma/schema.prisma`**

Change the `Guild` model's scalar fields to include `muteRoleId`:

```prisma
model Guild {
  id            String          @id
  createdAt     DateTime        @default(now())
  modLogEnabled Boolean         @default(false)
  dmOnAction    Boolean         @default(true)
  muteRoleId    String?
  antinuke      AntinukeConfig?
  logging       LoggingConfig?
  whitelist     Whitelist[]
  modRoles      ModRole[]
  cases         Case[]
}
```

- [ ] **Step 2: Regenerate the Prisma client and offline SQL**

Run:
```bash
npx prisma generate && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/manual_init.sql
```
Expected: client regenerated; `manual_init.sql` now includes the `muteRoleId` column on `Guild`.

- [ ] **Step 3: Write the failing test `test/core/ConfigService.config.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", antinuke: null, logging: null, modRoles: [], whitelist: [] })),
      create: vi.fn(async ({ data }) => ({ ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    loggingConfig: {
      upsert: vi.fn(async ({ where, create, update }) => ({ guildId: where.guildId, ...create, ...update })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    modRole: {
      upsert: vi.fn(async ({ create }) => ({ ...create })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    antinukeConfig: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    whitelist: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  };
}

describe("ConfigService config methods", () => {
  it("upserts logging config", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    const row = await svc.updateLogging("g1", { memberJoinLeave: "c1" });
    expect(row.memberJoinLeave).toBe("c1");
    expect(prisma.loggingConfig.upsert).toHaveBeenCalled();
  });

  it("adds and removes mod roles", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    const r = await svc.addModRole("g1", "role1");
    expect(r).toMatchObject({ guildId: "g1", roleId: "role1" });
    await svc.removeModRole("g1", "role1");
    expect(prisma.modRole.deleteMany).toHaveBeenCalledWith({ where: { guildId: "g1", roleId: "role1" } });
  });

  it("resets all guild config", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.resetGuildConfig("g1");
    expect(prisma.antinukeConfig.deleteMany).toHaveBeenCalledWith({ where: { guildId: "g1" } });
    expect(prisma.loggingConfig.deleteMany).toHaveBeenCalled();
    expect(prisma.modRole.deleteMany).toHaveBeenCalled();
    expect(prisma.whitelist.deleteMany).toHaveBeenCalled();
    expect(prisma.guild.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dmOnAction: true, muteRoleId: null }) }),
    );
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run test/core/ConfigService.config.test.js`
Expected: FAIL — `updateLogging is not a function`.

- [ ] **Step 5: Add the methods to `src/core/ConfigService.js`** (insert before `invalidate(guildId)`):

```js
  async updateLogging(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.loggingConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async addModRole(guildId, roleId) {
    await this.getGuild(guildId);
    const row = await this.prisma.modRole.upsert({
      where: { guildId_roleId: { guildId, roleId } },
      create: { guildId, roleId },
      update: {},
    });
    this.invalidate(guildId);
    return row;
  }

  async removeModRole(guildId, roleId) {
    await this.prisma.modRole.deleteMany({ where: { guildId, roleId } });
    this.invalidate(guildId);
  }

  async resetGuildConfig(guildId) {
    await this.prisma.antinukeConfig.deleteMany({ where: { guildId } });
    await this.prisma.loggingConfig.deleteMany({ where: { guildId } });
    await this.prisma.modRole.deleteMany({ where: { guildId } });
    await this.prisma.whitelist.deleteMany({ where: { guildId } });
    await this.prisma.guild.update({
      where: { id: guildId },
      data: { dmOnAction: true, muteRoleId: null, modLogEnabled: false },
    });
    this.invalidate(guildId);
  }
```

- [ ] **Step 6: Run to verify it passes (and existing ConfigService tests still pass)**

Run: `npx vitest run test/core/ConfigService.config.test.js test/core/ConfigService.test.js test/core/ConfigService.antinuke.test.js`
Expected: PASS — all green.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/manual_init.sql src/core/ConfigService.js test/core/ConfigService.config.test.js
git commit -m "feat(config): add mute-role schema and config persistence methods"
```

---

### Task 2: Command category tagging + autocomplete routing

**Files:**
- Modify: `src/core/CommandHandler.js` (tag discovered commands with their module folder as `category`)
- Modify: `src/modules/util/events/interactionCreate.js` (route autocomplete interactions)
- Test: `test/modules/util/autocompleteRouting.test.js`

**Interfaces:**
- Consumes: existing loader + router.
- Produces:
  - `discoverCommands(dir)` sets `command.category = <moduleFolderName>` on each discovered command.
  - `interactionCreate` listener handles `interaction.isAutocomplete()` by calling `command.autocomplete(interaction, ctx)` when present (guarded), before the chat-input path.

- [ ] **Step 1: Write the failing test `test/modules/util/autocompleteRouting.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import listener from "../../../src/modules/util/events/interactionCreate.js";

function ctx(command) {
  return {
    commands: new Map(command ? [[command.data.name, command]] : []),
    config: { getGuild: vi.fn(async () => ({ modRoles: [] })) },
    cooldowns: { check: vi.fn(() => ({ limited: false })) },
    logger: { error: vi.fn(), info: vi.fn() },
  };
}

function autocompleteInteraction(name) {
  return {
    isChatInputCommand: () => false,
    isAutocomplete: () => true,
    commandName: name,
    respond: vi.fn(async () => {}),
  };
}

describe("autocomplete routing", () => {
  it("calls the command's autocomplete handler", async () => {
    const autocomplete = vi.fn(async () => {});
    const command = { data: { name: "help" }, permissions: [], execute: vi.fn(), autocomplete };
    await listener.execute(ctx(command), autocompleteInteraction("help"));
    expect(autocomplete).toHaveBeenCalled();
  });

  it("ignores autocomplete for commands without a handler", async () => {
    const command = { data: { name: "ping" }, permissions: [], execute: vi.fn() };
    const i = autocompleteInteraction("ping");
    await expect(listener.execute(ctx(command), i)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/util/autocompleteRouting.test.js`
Expected: FAIL — autocomplete not routed (handler never called).

- [ ] **Step 3: Modify `src/modules/util/events/interactionCreate.js`** — add autocomplete routing at the very top of `execute`, before the `isChatInputCommand` guard:

```js
  async execute(ctx, interaction) {
    if (interaction.isAutocomplete()) {
      const command = ctx.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction, ctx);
        } catch (err) {
          ctx.logger.error({ err }, "autocomplete failed");
        }
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
```

(Keep the rest of the function unchanged.)

- [ ] **Step 4: Modify `src/core/CommandHandler.js`** — in `discoverCommands`, tag each command with its module folder. Change the push line inside the loop from:

```js
      if (mod.default) modules.push(mod.default);
```

to:

```js
      if (mod.default) {
        mod.default.category = md.name;
        modules.push(mod.default);
      }
```

- [ ] **Step 5: Run to verify it passes (and existing router tests still pass)**

Run: `npx vitest run test/modules/util`
Expected: PASS — autocomplete + existing interaction/ping tests green.

- [ ] **Step 6: Commit**

```bash
git add src/core/CommandHandler.js src/modules/util/events/interactionCreate.js test/modules/util/autocompleteRouting.test.js
git commit -m "feat(config): tag command categories and route autocomplete"
```

---

### Task 3: `/help` command (`src/modules/util/help.js`, `src/modules/util/commands/help.js`)

**Files:**
- Create: `src/modules/util/help.js` (pure embed builders)
- Create: `src/modules/util/commands/help.js`
- Test: `test/modules/util/help.test.js`

**Interfaces:**
- Consumes: `EmbedBuilder`, `COLORS`; `ctx.commands` (Map of `{ data: { name, description }, category?, permissions? }`).
- Produces:
  - `buildHelpOverviewEmbed(commands): EmbedBuilder` — groups command names by `category`.
  - `buildHelpDetailEmbed(command): EmbedBuilder` — name, description, category, permission note.
  - default-export command `{ data, permissions: [], execute(interaction, ctx), autocomplete(interaction, ctx) }`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import help from "../../../src/modules/util/commands/help.js";
import { buildHelpOverviewEmbed, buildHelpDetailEmbed } from "../../../src/modules/util/help.js";

function commandsMap() {
  return new Map([
    ["ban", { data: { name: "ban", description: "Ban a user" }, category: "moderation", permissions: [1] }],
    ["ping", { data: { name: "ping", description: "Latency" }, category: "util", permissions: [] }],
  ]);
}

describe("help embeds", () => {
  it("overview groups commands by category", () => {
    const e = buildHelpOverviewEmbed(commandsMap());
    const s = JSON.stringify(e.data);
    expect(s).toContain("moderation");
    expect(s).toContain("ban");
    expect(s).toContain("ping");
  });
  it("detail shows description and permission note", () => {
    const e = buildHelpDetailEmbed({ data: { name: "ban", description: "Ban a user" }, category: "moderation", permissions: [1] });
    const s = JSON.stringify(e.data);
    expect(s).toContain("Ban a user");
  });
});

describe("/help command", () => {
  it("with no argument replies with the overview", async () => {
    const ctx = { commands: commandsMap() };
    const i = { options: { getString: () => null }, reply: vi.fn(async () => {}) };
    await help.execute(i, ctx);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("with a known command replies with its detail", async () => {
    const ctx = { commands: commandsMap() };
    const i = { options: { getString: () => "ban" }, reply: vi.fn(async () => {}) };
    await help.execute(i, ctx);
    expect(i.reply).toHaveBeenCalled();
  });

  it("with an unknown command replies ephemerally", async () => {
    const ctx = { commands: commandsMap() };
    const i = { options: { getString: () => "nope" }, reply: vi.fn(async () => {}) };
    await help.execute(i, ctx);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("autocomplete responds with matching command names", async () => {
    const ctx = { commands: commandsMap() };
    const i = { options: { getFocused: () => "ba" }, respond: vi.fn(async () => {}) };
    await help.autocomplete(i, ctx);
    expect(i.respond).toHaveBeenCalledWith([{ name: "ban", value: "ban" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/util/help.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/util/help.js`**

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

export function buildHelpOverviewEmbed(commands) {
  const groups = new Map();
  for (const command of commands.values()) {
    const category = command.category ?? "other";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(command.data.name);
  }
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("📖 Commands")
    .setDescription("Use `/help <command>` for details on any command.");
  for (const [category, names] of [...groups.entries()].sort()) {
    embed.addFields({
      name: `${category} (${names.length})`,
      value: names.sort().map((n) => `\`${n}\``).join(", "),
    });
  }
  return embed;
}

export function buildHelpDetailEmbed(command) {
  const needsPerms = (command.permissions ?? []).length > 0;
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`/${command.data.name}`)
    .setDescription(command.data.description ?? "No description.")
    .addFields(
      { name: "Category", value: command.category ?? "other", inline: true },
      { name: "Access", value: needsPerms ? "Requires elevated permissions" : "Everyone", inline: true },
    );
}
```

- [ ] **Step 4: Write `src/modules/util/commands/help.js`**

```js
import { SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { buildHelpOverviewEmbed, buildHelpDetailEmbed } from "../help.js";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List commands or get help for a specific command.")
    .addStringOption((o) =>
      o.setName("command").setDescription("A command to get details on").setAutocomplete(true),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const name = interaction.options.getString("command");
    if (!name) {
      await interaction.reply({ embeds: [buildHelpOverviewEmbed(ctx.commands)] });
      return;
    }
    const command = ctx.commands.get(name);
    if (!command) {
      await interaction.reply({ embeds: [errorEmbed(`No command named \`${name}\`.`)], ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [buildHelpDetailEmbed(command)] });
  },
  async autocomplete(interaction, ctx) {
    const focused = (interaction.options.getFocused() ?? "").toLowerCase();
    const choices = [...ctx.commands.keys()]
      .filter((n) => n.toLowerCase().startsWith(focused))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    await interaction.respond(choices);
  },
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/util/help.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/util/help.js src/modules/util/commands/help.js test/modules/util/help.test.js
git commit -m "feat(config): add dynamic /help with autocomplete"
```

---

### Task 4: `/config` command

**Files:**
- Create: `src/modules/config/statusEmbed.js`
- Create: `src/modules/config/commands/config.js`
- Test: `test/modules/config/configCommand.test.js`

**Interfaces:**
- Consumes: `SlashCommandBuilder`, `PermissionFlagsBits`; `ConfigService` (`addModRole`/`removeModRole`/`updateGuild`/`resetGuildConfig`/`getGuild`); `successEmbed`.
- Produces:
  - `buildConfigEmbed(guildConfig): EmbedBuilder`.
  - default-export command with subcommands: `view`, `modrole` (`action: add|remove`, `role`), `dmonaction` (`state: on|off`), `muterole` (`role` optional — omit to clear), `reset`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/config/commands/config.js";
import { buildConfigEmbed } from "../../../src/modules/config/statusEmbed.js";

function ctx() {
  return {
    config: {
      addModRole: vi.fn(async () => ({})),
      removeModRole: vi.fn(async () => {}),
      updateGuild: vi.fn(async () => ({})),
      resetGuildConfig: vi.fn(async () => {}),
      getGuild: vi.fn(async () => ({ dmOnAction: true, muteRoleId: null, modRoles: [] })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction(sub, opts = {}) {
  return {
    guildId: "g1",
    options: {
      getSubcommand: () => sub,
      getString: (k) => opts[k] ?? null,
      getRole: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/config", () => {
  it("is admin-gated", () => {
    expect(command.data.name).toBe("config");
    expect(command.permissions.length).toBe(1);
  });
  it("modrole add stores a role", async () => {
    const c = ctx();
    await command.execute(interaction("modrole", { action: "add", role: { id: "r1" } }), c);
    expect(c.config.addModRole).toHaveBeenCalledWith("g1", "r1");
  });
  it("dmonaction off updates the flag", async () => {
    const c = ctx();
    await command.execute(interaction("dmonaction", { state: "off" }), c);
    expect(c.config.updateGuild).toHaveBeenCalledWith("g1", { dmOnAction: false });
  });
  it("muterole with no role clears it", async () => {
    const c = ctx();
    await command.execute(interaction("muterole", {}), c);
    expect(c.config.updateGuild).toHaveBeenCalledWith("g1", { muteRoleId: null });
  });
  it("reset calls resetGuildConfig", async () => {
    const c = ctx();
    await command.execute(interaction("reset"), c);
    expect(c.config.resetGuildConfig).toHaveBeenCalledWith("g1");
  });
  it("view replies with an embed", async () => {
    const c = ctx();
    const i = interaction("view");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});

describe("buildConfigEmbed", () => {
  it("summarizes settings", () => {
    const e = buildConfigEmbed({ dmOnAction: true, muteRoleId: "r9", modRoles: [{ roleId: "r1" }] });
    expect(JSON.stringify(e.data)).toContain("r9");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/config/configCommand.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/config/statusEmbed.js`**

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

export function buildConfigEmbed(guildConfig) {
  const modRoles = guildConfig.modRoles ?? [];
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("⚙️ Server Configuration")
    .addFields(
      { name: "DM on action", value: guildConfig.dmOnAction ? "on" : "off", inline: true },
      { name: "Mute role", value: guildConfig.muteRoleId ? `<@&${guildConfig.muteRoleId}>` : "none", inline: true },
      {
        name: `Mod roles (${modRoles.length})`,
        value: modRoles.length ? modRoles.map((r) => `<@&${r.roleId}>`).join(", ") : "none",
      },
    );
}
```

- [ ] **Step 4: Write `src/modules/config/commands/config.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed } from "../../../lib/embeds.js";
import { buildConfigEmbed } from "../statusEmbed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure the bot for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("view").setDescription("Show current configuration."))
    .addSubcommand((s) =>
      s
        .setName("modrole")
        .setDescription("Add or remove a moderator role.")
        .addStringOption((o) =>
          o.setName("action").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" },
          ),
        )
        .addRoleOption((o) => o.setName("role").setDescription("The role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("dmonaction")
        .setDescription("Whether to DM users when they are moderated.")
        .addStringOption((o) =>
          o.setName("state").setDescription("on or off").setRequired(true).addChoices(
            { name: "on", value: "on" },
            { name: "off", value: "off" },
          ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("muterole")
        .setDescription("Set the mute role (leave empty to clear).")
        .addRoleOption((o) => o.setName("role").setDescription("The mute role")),
    )
    .addSubcommand((s) => s.setName("reset").setDescription("Reset ALL bot configuration for this server.")),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "view") {
      const guildConfig = await ctx.config.getGuild(guildId);
      await interaction.reply({ embeds: [buildConfigEmbed(guildConfig)] });
      return;
    }
    if (sub === "modrole") {
      const action = interaction.options.getString("action");
      const role = interaction.options.getRole("role");
      if (action === "add") {
        await ctx.config.addModRole(guildId, role.id);
        await interaction.reply({ embeds: [successEmbed(`Added <@&${role.id}> as a mod role.`)] });
      } else {
        await ctx.config.removeModRole(guildId, role.id);
        await interaction.reply({ embeds: [successEmbed(`Removed <@&${role.id}> as a mod role.`)] });
      }
      return;
    }
    if (sub === "dmonaction") {
      const on = interaction.options.getString("state") === "on";
      await ctx.config.updateGuild(guildId, { dmOnAction: on });
      await interaction.reply({ embeds: [successEmbed(`DM-on-action is now **${on ? "on" : "off"}**.`)] });
      return;
    }
    if (sub === "muterole") {
      const role = interaction.options.getRole("role");
      await ctx.config.updateGuild(guildId, { muteRoleId: role ? role.id : null });
      await interaction.reply({
        embeds: [successEmbed(role ? `Mute role set to <@&${role.id}>.` : "Mute role cleared.")],
      });
      return;
    }
    if (sub === "reset") {
      await ctx.config.resetGuildConfig(guildId);
      await interaction.reply({ embeds: [successEmbed("All configuration has been reset to defaults.")] });
    }
  },
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/config/configCommand.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/config/statusEmbed.js src/modules/config/commands/config.js test/modules/config/configCommand.test.js
git commit -m "feat(config): add /config command"
```

---

### Task 5: `/logging` command

**Files:**
- Create: `src/modules/config/commands/logging.js`
- Test: `test/modules/config/loggingCommand.test.js`

**Interfaces:**
- Consumes: `ConfigService` (`updateLogging`/`getGuild`); `successEmbed`/`errorEmbed`; the logging category keys.
- Produces: default-export command with subcommands: `set` (`category` choice, `channel`), `disable` (`category` choice), `enable` (`category` choice), `view`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/config/commands/logging.js";

function ctx(loggingRow = { disabled: [] }) {
  return {
    config: {
      updateLogging: vi.fn(async () => ({})),
      getGuild: vi.fn(async () => ({ logging: loggingRow })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction(sub, opts = {}) {
  return {
    guildId: "g1",
    options: {
      getSubcommand: () => sub,
      getString: (k) => opts[k] ?? null,
      getChannel: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/logging", () => {
  it("set maps a category to a channel", async () => {
    const c = ctx();
    await command.execute(interaction("set", { category: "memberJoinLeave", channel: { id: "c1" } }), c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { memberJoinLeave: "c1" });
  });

  it("disable adds a category to the disabled list", async () => {
    const c = ctx({ disabled: [] });
    await command.execute(interaction("disable", { category: "voice" }), c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { disabled: ["voice"] });
  });

  it("enable removes a category from the disabled list", async () => {
    const c = ctx({ disabled: ["voice", "modActions"] });
    await command.execute(interaction("enable", { category: "voice" }), c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { disabled: ["modActions"] });
  });

  it("view replies with an embed", async () => {
    const c = ctx({ memberJoinLeave: "c1", disabled: [] });
    const i = interaction("view");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/config/loggingCommand.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/config/commands/logging.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { successEmbed } from "../../../lib/embeds.js";
import { COLORS } from "../../../lib/constants.js";

const CATEGORIES = [
  "memberJoinLeave",
  "messageEdit",
  "messageDelete",
  "modActions",
  "roleChanges",
  "channelChanges",
  "voice",
  "serverChanges",
];

const categoryChoices = CATEGORIES.map((c) => ({ name: c, value: c }));

export default {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Configure event logging channels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Route a log category to a channel.")
        .addStringOption((o) =>
          o.setName("category").setDescription("Event category").setRequired(true).addChoices(...categoryChoices),
        )
        .addChannelOption((o) => o.setName("channel").setDescription("Target channel").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("disable")
        .setDescription("Disable a log category.")
        .addStringOption((o) =>
          o.setName("category").setDescription("Event category").setRequired(true).addChoices(...categoryChoices),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("enable")
        .setDescription("Re-enable a disabled log category.")
        .addStringOption((o) =>
          o.setName("category").setDescription("Event category").setRequired(true).addChoices(...categoryChoices),
        ),
    )
    .addSubcommand((s) => s.setName("view").setDescription("Show current logging configuration.")),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "set") {
      const category = interaction.options.getString("category");
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateLogging(guildId, { [category]: channel.id });
      await interaction.reply({ embeds: [successEmbed(`\`${category}\` logs will go to <#${channel.id}>.`)] });
      return;
    }
    if (sub === "disable" || sub === "enable") {
      const category = interaction.options.getString("category");
      const guildConfig = await ctx.config.getGuild(guildId);
      const current = new Set(guildConfig.logging?.disabled ?? []);
      if (sub === "disable") current.add(category);
      else current.delete(category);
      await ctx.config.updateLogging(guildId, { disabled: [...current] });
      await interaction.reply({
        embeds: [successEmbed(`\`${category}\` logging **${sub === "disable" ? "disabled" : "enabled"}**.`)],
      });
      return;
    }
    if (sub === "view") {
      const guildConfig = await ctx.config.getGuild(guildId);
      const logging = guildConfig.logging ?? {};
      const disabled = new Set(logging.disabled ?? []);
      const embed = new EmbedBuilder().setColor(COLORS.info).setTitle("📋 Logging Configuration");
      embed.setDescription(
        CATEGORIES.map((c) => {
          const channelId = logging[c];
          const state = disabled.has(c) ? "disabled" : channelId ? `<#${channelId}>` : "unset";
          return `**${c}:** ${state}`;
        }).join("\n"),
      );
      await interaction.reply({ embeds: [embed] });
    }
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/config/loggingCommand.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/config/commands/logging.js test/modules/config/loggingCommand.test.js
git commit -m "feat(config): add /logging command"
```

---

### Task 6: Role-based `/mute` and `/unmute`

**Files:**
- Create: `src/modules/moderation/commands/mute.js`
- Create: `src/modules/moderation/commands/unmute.js`
- Modify: `src/modules/moderation/helpers.js` (add `mute`/`unmute` to `TYPE_COLORS`)
- Test: `test/modules/moderation/mute.test.js`

**Interfaces:**
- Consumes: `checkHierarchy`, `dmTarget`, `buildCaseEmbed`; `ctx.config.getGuild` (for `muteRoleId`, `dmOnAction`), `ctx.cases`.
- Produces: `/mute` adds the configured mute role (errors if unset) and records a `mute` case; `/unmute` removes it and records an `unmute` case.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import mute from "../../../src/modules/moderation/commands/mute.js";
import unmute from "../../../src/modules/moderation/commands/unmute.js";

function ctx({ muteRoleId = "mute1" } = {}) {
  return {
    cases: { createCase: vi.fn(async (d) => ({ caseNumber: 1, ...d })) },
    config: { getGuild: vi.fn(async () => ({ muteRoleId, dmOnAction: false })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}
function makeMember() {
  return {
    id: "t1",
    roles: { highest: { position: 3 }, add: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
    guild: { ownerId: "owner" },
  };
}
function interaction(member, opts = {}) {
  return {
    guildId: "g1",
    guild: {
      name: "T",
      ownerId: "owner",
      members: { me: { id: "bot", roles: { highest: { position: 100 } } }, fetch: vi.fn(async () => member) },
    },
    user: { id: "mod1" },
    member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
    options: { getUser: () => ({ id: "t1", send: vi.fn() }), getString: (k) => opts[k] ?? null },
    reply: vi.fn(async () => {}),
  };
}

describe("/mute", () => {
  it("adds the mute role and records a case", async () => {
    const c = ctx();
    const member = makeMember();
    await mute.execute(interaction(member, { reason: "spam" }), c);
    expect(member.roles.add).toHaveBeenCalledWith("mute1", expect.any(String));
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "mute" }));
  });

  it("errors when no mute role is configured", async () => {
    const c = ctx({ muteRoleId: null });
    const member = makeMember();
    const i = interaction(member);
    await mute.execute(i, c);
    expect(member.roles.add).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});

describe("/unmute", () => {
  it("removes the mute role and records a case", async () => {
    const c = ctx();
    const member = makeMember();
    await unmute.execute(interaction(member), c);
    expect(member.roles.remove).toHaveBeenCalledWith("mute1", expect.any(String));
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "unmute" }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/moderation/mute.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Modify `src/modules/moderation/helpers.js`** — add `mute`/`unmute` to `TYPE_COLORS`:

```js
const TYPE_COLORS = {
  ban: COLORS.error,
  tempban: COLORS.error,
  softban: COLORS.error,
  kick: COLORS.warn,
  timeout: COLORS.warn,
  mute: COLORS.warn,
  warn: COLORS.warn,
  unban: COLORS.success,
  untimeout: COLORS.success,
  unmute: COLORS.success,
};
```

- [ ] **Step 4: Write `src/modules/moderation/commands/mute.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Apply the configured mute role to a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to mute").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (!guildConfig.muteRoleId) {
      await interaction.reply({
        embeds: [errorEmbed("No mute role is set. An admin can set one with `/config muterole`.")],
        ephemeral: true,
      });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
      return;
    }
    const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember: interaction.guild.members.me });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }

    if (guildConfig.dmOnAction) {
      await dmTarget(user, infoEmbed(`You were muted in ${interaction.guild.name}`, `**Reason:** ${reason}`), ctx.logger);
    }

    try {
      await targetMember.roles.add(guildConfig.muteRoleId, reason);
    } catch (err) {
      ctx.logger.error({ err }, "mute failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't apply the mute role — check my permissions and role position.")], ephemeral: true });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "mute",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 5: Write `src/modules/moderation/commands/unmute.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, buildCaseEmbed } from "../helpers.js";
import { errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove the configured mute role from a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to unmute").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (!guildConfig.muteRoleId) {
      await interaction.reply({
        embeds: [errorEmbed("No mute role is set.")],
        ephemeral: true,
      });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
      return;
    }
    const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember: interaction.guild.members.me });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }

    try {
      await targetMember.roles.remove(guildConfig.muteRoleId, reason);
    } catch (err) {
      ctx.logger.error({ err }, "unmute failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't remove the mute role.")], ephemeral: true });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "unmute",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 6: Run to verify it passes (and moderation helper tests still pass)**

Run: `npx vitest run test/modules/moderation/mute.test.js test/modules/moderation/helpers.test.js`
Expected: PASS — all green.

- [ ] **Step 7: Commit**

```bash
git add src/modules/moderation/commands/mute.js src/modules/moderation/commands/unmute.js src/modules/moderation/helpers.js test/modules/moderation/mute.test.js
git commit -m "feat(mod): add role-based mute and unmute"
```

---

### Task 7: Docs + full verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new (all commands auto-discovered).
- Produces: updated docs; a green full suite.

- [ ] **Step 1: Update `README.md`** — add a Configuration & Help section before `## Status`:

````markdown
## Configuration & Help

- `/config` — `view`, `modrole add|remove`, `dmonaction on|off`, `muterole [role]`, `reset`.
- `/logging` — `set <category> <channel>`, `disable <category>`, `enable <category>`, `view`.
- `/antinuke` — anti-nuke setup (see Anti-Nuke).
- `/help` — dynamic, category-grouped command list with `/help <command>` details and autocomplete.

Role-based `/mute` and `/unmute` use the mute role set via `/config muterole`.
````

Update `## Status` to:
````markdown
## Status

Phase 1 complete: foundation, anti-nuke, moderation, logging, and config/help. Later phases
(invite tracking, auto-moderation, welcome/autorole, music, dashboard) are documented in
`docs/superpowers/specs`.
````

- [ ] **Step 2: Run the full test suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all tests PASS; lint exit 0.

- [ ] **Step 3: Verify the bot wires up (all commands load)**

Run: `node src/bot.js`
Expected: exits with the `Invalid environment` error (proves every command/module — including the new `config` module — imports and the loader resolves).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document config, logging, and help commands"
```

---

## Self-Review

**Spec coverage (spec §10 Config, §11 Help, plus deferred §8 mute):**
- `/config` sets mod roles, DM-on-action, mute role, view, reset → Task 4. ✓
- `/logging` sets per-category log channels + enable/disable + view → Task 5. ✓
- Anti-nuke config handled by existing `/antinuke` → referenced, not duplicated. ✓
- `/help` dynamic, category-grouped, `/help <command>` detail, autocomplete → Tasks 2 (routing/tagging) + 3. ✓
- Role-based `/mute` + `/unmute` using a configured mute role (deferred from Phase 3) → Tasks 1 (schema/persistence) + 6. ✓
- All writes go through `ConfigService` (cache + write-through) → Task 1 methods used by Tasks 4/5. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every command and helper is complete with real tests. ✓

**Type consistency:**
- `ConfigService.updateLogging/addModRole/removeModRole/resetGuildConfig` (T1) match call sites in `/config` (T4) and `/logging` (T5). ✓
- `ConfigService.updateGuild(guildId, { dmOnAction | muteRoleId })` (foundation) used by `/config` (T4) — `muteRoleId` column added in T1. ✓
- `discoverCommands` tagging `command.category` (T2) matches `buildHelpOverviewEmbed`/`buildHelpDetailEmbed` grouping (T3). ✓
- Autocomplete routing in `interactionCreate` (T2) calls `command.autocomplete(interaction, ctx)` — matches `/help` (T3). ✓
- `ctx.commands` Map of `{ data:{name,description}, category, permissions }` (foundation loader + T2) matches `/help` consumers (T3). ✓
- `checkHierarchy`/`dmTarget`/`buildCaseEmbed` (moderation helpers) and `ctx.config.getGuild` returning `muteRoleId` match `/mute`/`/unmute` (T6). ✓
- `TYPE_COLORS` extended with `mute`/`unmute` (T6) matches the new case types. ✓
