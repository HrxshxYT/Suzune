import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/automod/commands/automod.js";
import {
  handleRulesAdd,
  handleRulesList,
  handleRulesRemove,
  handleRulesEdit,
} from "../../../src/modules/automod/commands/rules.js";

function interaction(opts = {}, overrides = {}) {
  return {
    guildId: "g",
    user: { id: "mod1" },
    options: {
      getSubcommandGroup: overrides.group !== undefined ? () => overrides.group : () => null,
      getSubcommand: overrides.sub !== undefined ? () => overrides.sub : () => null,
      getString: (k) => opts[k] ?? null,
      getInteger: (k) => opts[k] ?? null,
      getBoolean: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("rules add", () => {
  it("rejects an invalid re2 pattern with a readable error", async () => {
    const ctx = {
      config: { getAutomodRules: vi.fn(async () => []), addAutomodRule: vi.fn() },
      automodRules: { invalidate: vi.fn() },
    };
    const i = interaction({ pattern: "foo(?=bar)" });
    await handleRulesAdd(i, ctx);

    expect(ctx.config.addAutomodRule).not.toHaveBeenCalled();
    expect(ctx.automodRules.invalidate).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledTimes(1);
    const replyArg = i.reply.mock.calls[0][0];
    expect(replyArg.ephemeral).toBe(true);
    const embed = replyArg.embeds[0];
    expect(embed.data.description).toMatch(/invalid pattern/i);
  });

  it("enforces the per-guild rule cap", async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: String(i), source: "custom" }));
    const ctx = {
      config: { getAutomodRules: vi.fn(async () => many), addAutomodRule: vi.fn() },
      automodRules: { invalidate: vi.fn() },
    };
    const i = interaction({ pattern: "valid" });
    await handleRulesAdd(i, ctx);

    expect(ctx.config.addAutomodRule).not.toHaveBeenCalled();
    expect(ctx.automodRules.invalidate).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledTimes(1);
    const embed = i.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toMatch(/50/);
  });

  it("adds a valid rule and invalidates the cache", async () => {
    const ctx = {
      config: {
        getAutomodRules: vi.fn(async () => []),
        addAutomodRule: vi.fn().mockResolvedValue({ id: "1" }),
      },
      automodRules: { invalidate: vi.fn() },
    };
    const i = interaction({ pattern: "scam", weight: 30, target: "any" });
    await handleRulesAdd(i, ctx);

    expect(ctx.config.addAutomodRule).toHaveBeenCalledWith(
      "g",
      expect.objectContaining({ source: "custom", pattern: "scam", target: "any", weight: 30 }),
    );
    expect(ctx.automodRules.invalidate).toHaveBeenCalledWith("g");
    expect(i.reply).toHaveBeenCalledTimes(1);
    const embed = i.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toMatch(/rule added/i);
  });
});

describe("rules list", () => {
  it("lists only custom rules", async () => {
    const ctx = {
      config: {
        getAutomodRules: vi.fn(async () => [
          { id: "abcdef01", source: "custom", weight: 20, pattern: "scam", enabled: true, dryRun: false },
          { id: "packrule", source: "pack:financial", weight: 40, pattern: "nope", enabled: true },
        ]),
      },
    };
    const i = interaction({});
    await handleRulesList(i, ctx);

    expect(i.reply).toHaveBeenCalledTimes(1);
    const embed = i.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toContain("scam");
    expect(embed.data.description).not.toContain("nope");
  });

  it("shows a friendly message when there are no custom rules", async () => {
    const ctx = { config: { getAutomodRules: vi.fn(async () => []) } };
    const i = interaction({});
    await handleRulesList(i, ctx);

    const embed = i.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toMatch(/no custom rules/i);
  });
});

describe("rules remove", () => {
  it("removes a rule and invalidates the cache", async () => {
    const ctx = {
      config: { removeAutomodRule: vi.fn(async () => {}) },
      automodRules: { invalidate: vi.fn() },
    };
    const i = interaction({ id: "abc123" });
    await handleRulesRemove(i, ctx);

    expect(ctx.config.removeAutomodRule).toHaveBeenCalledWith("g", "abc123");
    expect(ctx.automodRules.invalidate).toHaveBeenCalledWith("g");
    expect(i.reply).toHaveBeenCalledTimes(1);
    const embed = i.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toMatch(/rule removed/i);
  });
});

describe("rules edit", () => {
  it("rejects an invalid re2 pattern without touching the config", async () => {
    const ctx = {
      config: { editAutomodRule: vi.fn() },
      automodRules: { invalidate: vi.fn() },
    };
    const i = interaction({ id: "abc123", pattern: "foo(?=bar)" });
    await handleRulesEdit(i, ctx);

    expect(ctx.config.editAutomodRule).not.toHaveBeenCalled();
    expect(ctx.automodRules.invalidate).not.toHaveBeenCalled();
    const embed = i.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toMatch(/invalid pattern/i);
  });

  it("edits a rule and invalidates the cache", async () => {
    const ctx = {
      config: { editAutomodRule: vi.fn(async () => ({ id: "abc123" })) },
      automodRules: { invalidate: vi.fn() },
    };
    const i = interaction({ id: "abc123", weight: 15, dryrun: true });
    await handleRulesEdit(i, ctx);

    expect(ctx.config.editAutomodRule).toHaveBeenCalledWith(
      "g",
      "abc123",
      expect.objectContaining({ weight: 15, dryRun: true }),
    );
    expect(ctx.automodRules.invalidate).toHaveBeenCalledWith("g");
    const embed = i.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.description).toMatch(/rule updated/i);
  });
});

describe("/automod command", () => {
  it("is admin-gated with rules/test/logs/panel/packs/exempt subcommands", () => {
    expect(command.data.name).toBe("automod");
    expect(command.permissions).toEqual([expect.anything()]);
    const json = command.data.toJSON();
    const names = json.options.map((o) => o.name).sort();
    expect(names).toEqual(["exempt", "logs", "packs", "panel", "rules", "test"]);
    const rulesGroup = json.options.find((o) => o.name === "rules");
    const subNames = rulesGroup.options.map((o) => o.name).sort();
    expect(subNames).toEqual(["add", "edit", "list", "remove"]);
  });

  it("routes rules add/list/remove/edit to the rules handlers", async () => {
    const ctx = {
      config: {
        getAutomodRules: vi.fn(async () => []),
        addAutomodRule: vi.fn(async () => ({ id: "1" })),
      },
      automodRules: { invalidate: vi.fn() },
    };
    const i = interaction({ pattern: "scam" }, { group: "rules", sub: "add" });
    await command.execute(i, ctx);
    expect(ctx.config.addAutomodRule).toHaveBeenCalled();
  });

  it("routes test subcommand to handleTest", async () => {
    const ctx = {};
    const i = interaction({ pattern: "scam", sample: "buy scam now" }, { group: null, sub: "test" });
    await command.execute(i, ctx);
    expect(i.reply).toHaveBeenCalledTimes(1);
    const embed = i.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toMatch(/rule test/i);
  });

  it("routes logs subcommand to handleLogs", async () => {
    const ctx = { config: { getAutomodLogs: vi.fn(async () => []) } };
    const i = interaction({}, { group: null, sub: "logs" });
    await command.execute(i, ctx);
    expect(ctx.config.getAutomodLogs).toHaveBeenCalledWith("g", 20);
  });

  it("routes panel/packs/exempt subcommands to runAutomodPanel", async () => {
    const ctx = {
      config: {
        getGuild: vi.fn(async () => ({ automod: {} })),
        getPackStates: vi.fn(async () => []),
      },
      awaitFn: vi.fn(async () => null),
    };
    const i = interaction({}, { group: null, sub: "panel" });
    await command.execute(i, ctx);
    expect(ctx.config.getGuild).toHaveBeenCalledWith("g");
    expect(ctx.config.getPackStates).toHaveBeenCalledWith("g");
  });
});
