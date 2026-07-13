import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runWatchVcPanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("watchvc")
    .setDescription("Open the Watch VC guard-presence panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runWatchVcPanel(interaction, ctx),
};
