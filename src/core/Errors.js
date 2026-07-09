import { errorEmbed } from "../lib/embeds.js";

export async function runSafely({ fn, interaction, logger }) {
  try {
    await fn();
    return true;
  } catch (err) {
    logger.error({ err }, "command execution failed");
    const payload = {
      embeds: [errorEmbed("Something went wrong running that command.")],
      ephemeral: true,
    };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (replyErr) {
      logger.error({ err: replyErr }, "failed to send error reply");
    }
    return false;
  }
}
