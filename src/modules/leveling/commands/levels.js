import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runLevelingPanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("levels")
    .setDescription("Open the leveling control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runLevelingPanel(interaction, ctx),
};
