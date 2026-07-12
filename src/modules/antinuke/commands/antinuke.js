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
