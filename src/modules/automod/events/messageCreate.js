import { Events } from "discord.js";
import { runPipeline } from "../pipeline/index.js";
import { isExempt } from "../pipeline/act.js";
import { KNOWN_SHORTENERS } from "../pipeline/url.js";
import { PACKS } from "../rules/packs/index.js";

// Assemble the effective rule rows for a guild: enabled packs' rules (with a
// synthetic id per rule) + the guild's custom rules.
function effectiveRules(packStates, customRules) {
  const enabled = new Map(packStates.filter((p) => p.enabled).map((p) => [p.packId, p]));
  const rows = [];
  for (const pack of PACKS) {
    if (!enabled.has(pack.id)) continue;
    pack.rules.forEach((r, i) =>
      rows.push({ id: `${pack.id}#${i}`, source: pack.id, enabled: true, ...r }),
    );
  }
  for (const r of customRules) if (r.enabled !== false) rows.push(r);
  return rows;
}

export default {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || message.author?.bot) return;

    const guildConfig = await ctx.config.getGuild(message.guild.id);
    const config = guildConfig.automod;
    if (!config?.enabled) return;

    const member = message.member;
    if (isExempt({ member, channelId: message.channelId, config })) return;

    // Compiled rules are cached per guild; the cache is cold on first use and is
    // invalidated by the rule/pack management commands and the self-heal loop below
    // (not by ConfigService.invalidate, which only clears the guild-config cache).
    let compiledRules = ctx.automodRules.get(message.guild.id);
    if (!compiledRules) {
      const [packStates, customRules] = await Promise.all([
        ctx.config.getPackStates(message.guild.id),
        ctx.config.getAutomodRules(message.guild.id),
      ]);
      compiledRules = ctx.automodRules.set(
        message.guild.id,
        effectiveRules(packStates, customRules),
      );
    }

    const result = await runPipeline({
      message,
      member,
      config,
      guildConfig,
      compiledRules,
      heat: ctx.heat,
      blocklist: ctx.automodFeed.getBlocklist(),
      shorteners: KNOWN_SHORTENERS,
      cases: ctx.cases,
      logger: ctx.logger,
    });

    // Self-heal: persist and report any rule that blew its time budget.
    for (const d of result.disabled ?? []) {
      if (d.id.includes("#")) continue; // pack rule — don't persist-disable built-ins
      try {
        await ctx.config.disableAutomodRule(message.guild.id, d.id, d.reason);
      } catch {
        // best-effort persistence; the in-memory cache invalidation below still applies
      }
      ctx.automodRules.invalidate(message.guild.id);
      ctx.logger.warn?.({ rule: d.id, reason: d.reason }, "automod: rule auto-disabled");
    }

    // Log every hit, including dry-run.
    for (const hit of [...result.hits, ...result.dryRunHits]) {
      try {
        await ctx.config.addAutomodLog(message.guild.id, {
          userId: message.author.id,
          channelId: message.channelId,
          source: hit.source,
          action: hit.dryRun
            ? "log-only"
            : (result.memberAction ?? (hit.deleteOnHit ? "delete" : "flagged")),
          dryRun: Boolean(hit.dryRun),
          heatAfter: Math.round(result.heatAfter ?? 0),
          sample: (message.content ?? "").slice(0, 200),
        });
      } catch {
        // best-effort logging; a log write failure must not block message handling
      }
    }
  },
};
