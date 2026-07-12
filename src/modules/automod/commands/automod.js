import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runAutomodPanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Open the auto-moderation control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runAutomodPanel(interaction, ctx),
};
