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
