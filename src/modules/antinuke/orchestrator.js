import { Events } from "discord.js";
import { mapAuditLogEntry } from "./actions.js";
import { getThreshold, getWhitelistLimit, isWhitelisted } from "./config.js";
import { evaluate } from "./engine.js";
import { applyPunishment } from "./punish.js";
import { revertAction } from "./revert.js";
import { sendAlert } from "./alert.js";

export async function processAuditEntry({ entry, guild, guildConfig, state, deps, logger }) {
  const mapped = mapAuditLogEntry(entry);
  if (!mapped) return { action: "ignored" };

  const antinuke = guildConfig.antinuke;
  if (!antinuke?.enabled) return { action: "disabled" };

  const executorId = entry.executorId;
  if (!executorId) return { action: "no_executor" };
  if (executorId === guild.ownerId) return { action: "exempt_owner" };
  if (executorId === guild.members.me.id) return { action: "exempt_self" };

  const member = await deps.fetchMember(guild, executorId);

  let count;
  let reason;
  if (isWhitelisted(member, guildConfig.whitelist)) {
    // Whitelisted users are exempt unless a per-action whitelist limit is on
    // and they blow past it (a safety net against a compromised trusted account).
    const wl = antinuke.whitelistLimitEnabled ? getWhitelistLimit(antinuke, mapped.actionKey) : null;
    if (!wl?.enabled) return { action: "exempt_whitelist" };
    const wlCount = state.recordAction(
      guild.id,
      `wl:${mapped.actionKey}`,
      executorId,
      wl.windowSec * 1000,
    );
    if (wlCount < wl.limit) return { action: "exempt_whitelist_under", count: wlCount };
    count = wlCount;
    reason = `Anti-nuke: whitelisted user exceeded ${mapped.actionKey} limit`;
  } else {
    const threshold = getThreshold(antinuke, mapped.actionKey);
    if (!threshold.enabled) return { action: "action_disabled" };
    const c = state.recordAction(guild.id, mapped.actionKey, executorId, threshold.windowSec * 1000);
    const { triggered } = evaluate({ count: c, limit: threshold.limit, panic: antinuke.panicMode });
    if (!triggered) return { action: "under_threshold", count: c };
    count = c;
    reason = `Anti-nuke: excessive ${mapped.actionKey}`;
  }

  const punishment = await deps.applyPunishment({
    type: antinuke.punishment,
    guild,
    executorId,
    member,
    reason,
    quarantineRoleId: antinuke.quarantineRoleId,
    logger,
  });

  if (antinuke.autoRevert) {
    await deps.revertAction({ actionKey: mapped.actionKey, entry, guild, logger });
  }

  await deps.sendAlert(
    {
      guild,
      channelId: antinuke.alertChannelId,
      actionKey: mapped.actionKey,
      executorId,
      count,
      punishment,
    },
    logger,
  );

  return { action: "punished", punishment, count };
}

export default {
  name: Events.GuildAuditLogEntryCreate,
  async execute(ctx, entry, guild) {
    try {
      const guildConfig = await ctx.config.getGuild(guild.id);
      const deps = {
        fetchMember: async (g, id) => g.members.fetch(id).catch(() => null),
        applyPunishment,
        revertAction,
        sendAlert,
      };
      const result = await processAuditEntry({
        entry,
        guild,
        guildConfig,
        state: ctx.antinuke,
        deps,
        logger: ctx.logger,
      });
      if (result?.action === "punished" && ctx.stats) {
        await ctx.stats
          .incrementAntinukeTriggers()
          .catch((err) => ctx.logger.error({ err }, "anti-nuke stat increment failed"));
      }
    } catch (err) {
      ctx.logger.error({ err }, "anti-nuke listener error");
    }
  },
};
