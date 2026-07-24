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
      s
        .setName("test")
        .setDescription("Test a pattern against sample text.")
        .addStringOption((o) => o.setName("pattern").setDescription("re2 pattern").setRequired(true))
        .addStringOption((o) => o.setName("sample").setDescription("sample text").setRequired(true)),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("rules")
        .setDescription("Custom re2 rules (no lookaround/backrefs).")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Add a custom rule.")
            .addStringOption((o) => o.setName("pattern").setDescription("re2 pattern").setRequired(true))
            .addStringOption((o) =>
              o
                .setName("target")
                .setDescription("raw|normalized|stripped|any")
                .addChoices(
                  { name: "any", value: "any" },
                  { name: "normalized", value: "normalized" },
                  { name: "stripped", value: "stripped" },
                  { name: "raw", value: "raw" },
                ),
            )
            .addIntegerOption((o) => o.setName("weight").setDescription("heat weight (default 20)"))
            .addBooleanOption((o) => o.setName("dryrun").setDescription("log-only, no punishment")),
        )
        .addSubcommand((s) => s.setName("list").setDescription("List custom rules."))
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Remove a rule.")
            .addStringOption((o) => o.setName("id").setDescription("rule id").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("edit")
            .setDescription("Edit a rule.")
            .addStringOption((o) => o.setName("id").setDescription("rule id").setRequired(true))
            .addStringOption((o) => o.setName("pattern").setDescription("new re2 pattern"))
            .addIntegerOption((o) => o.setName("weight").setDescription("new weight"))
            .addBooleanOption((o) => o.setName("dryrun").setDescription("toggle dry-run")),
        ),
    ),
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
