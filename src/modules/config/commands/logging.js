import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runLoggingPanel } from "../logging/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Open the event-logging control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runLoggingPanel(interaction, ctx),
};
