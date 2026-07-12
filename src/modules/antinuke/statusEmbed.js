import { EmbedBuilder } from "discord.js";
import { COLORS, LIMITS } from "../../lib/constants.js";

// Joins a list of mentions into a single field value, trimming to Discord's
// per-field character limit and noting how many entries were left off.
function mentionList(mentions) {
  const lines = [];
  let length = 0;
  for (let i = 0; i < mentions.length; i++) {
    const line = mentions[i];
    const remaining = mentions.length - i;
    const suffix = remaining > 1 ? `\n…and ${remaining} more` : "";
    if (length + line.length + 1 + suffix.length > LIMITS.embedFieldValue) {
      lines.push(`…and ${remaining} more`);
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }
  return lines.join("\n");
}

export function buildWhitelistEmbed(whitelist = []) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("🛡️ Anti-Nuke Whitelist");

  if (!whitelist.length) {
    return embed.setDescription(
      "No trusted users or roles are whitelisted yet.\nUse the **Add a user or role** menu below to add one.",
    );
  }

  const users = whitelist.filter((e) => e.type === "user").map((e) => `<@${e.targetId}>`);
  const roles = whitelist.filter((e) => e.type === "role").map((e) => `<@&${e.targetId}>`);

  if (users.length) {
    embed.addFields({ name: `👤 Users (${users.length})`, value: mentionList(users) });
  }
  if (roles.length) {
    embed.addFields({ name: `🎭 Roles (${roles.length})`, value: mentionList(roles) });
  }

  return embed.setFooter({
    text: `${whitelist.length} ${whitelist.length === 1 ? "entry" : "entries"} bypass anti-nuke`,
  });
}
