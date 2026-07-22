import {
  AutoModerationRuleTriggerType as Trigger,
  AutoModerationActionType as Action,
  AutoModerationRuleEventType as Event,
  AutoModerationRuleKeywordPresetType as Preset,
  PermissionFlagsBits,
} from "discord.js";

// All bot-provisioned rules share this prefix so we can find and reconcile our
// own rules on every sync without clobbering rules the server made by hand.
export const RULE_PREFIX = "Suzune • ";

const BLOCK_MESSAGE = "This message was blocked by Suzune AutoMod.";
const MAX_TIMEOUT_SEC = 2419200; // Discord's 28-day ceiling.

// The four native rules we manage, keyed by the config column that enables each.
// `timeoutAllowed` reflects Discord's rule: Timeout actions are only valid on
// Keyword and MentionSpam triggers.
export const RULE_DEFS = {
  nativeInvites: {
    name: `${RULE_PREFIX}Invite Links`,
    triggerType: Trigger.Keyword,
    timeoutAllowed: true,
    triggerMetadata: () => ({
      keywordFilter: [
        "discord.gg/*",
        "discord.com/invite/*",
        "discordapp.com/invite/*",
        "discord.io/*",
        "discord.me/*",
        "dsc.gg/*",
        "invite.gg/*",
      ],
      regexPatterns: [
        "(?i)discord(?:app)?\\.com/invite/[a-z0-9-]+",
        "(?i)discord\\.(gg|io|me|li)/[a-z0-9-]+",
      ],
    }),
  },
  nativeMentions: {
    name: `${RULE_PREFIX}Mention Spam`,
    triggerType: Trigger.MentionSpam,
    timeoutAllowed: true,
    triggerMetadata: (cfg) => ({
      mentionTotalLimit: Math.max(1, Math.min(50, cfg.mentionLimit ?? 5)),
      mentionRaidProtectionEnabled: true,
    }),
  },
  nativeSpam: {
    name: `${RULE_PREFIX}Spam`,
    triggerType: Trigger.Spam,
    timeoutAllowed: false,
    triggerMetadata: () => ({}),
  },
  nativePresets: {
    name: `${RULE_PREFIX}Profanity & Slurs`,
    triggerType: Trigger.KeywordPreset,
    timeoutAllowed: false,
    triggerMetadata: () => ({
      presets: [Preset.Profanity, Preset.Slurs],
      allowList: [],
    }),
  },
};

export const RULE_KEYS = Object.keys(RULE_DEFS);

// The action list for a rule: always block; alert when a channel is set; time
// the offender out when enabled and the trigger supports it.
export function buildActions(def, cfg) {
  const actions = [
    { type: Action.BlockMessage, metadata: { customMessage: BLOCK_MESSAGE } },
  ];
  if (cfg.nativeAlert && cfg.nativeAlertChannelId) {
    actions.push({
      type: Action.SendAlertMessage,
      metadata: { channel: cfg.nativeAlertChannelId },
    });
  }
  if (cfg.nativeTimeout && def.timeoutAllowed) {
    actions.push({
      type: Action.Timeout,
      metadata: {
        durationSeconds: Math.max(1, Math.min(MAX_TIMEOUT_SEC, cfg.nativeTimeoutSeconds ?? 300)),
      },
    });
  }
  return actions;
}

function toIdArray(value, max) {
  const arr = Array.isArray(value) ? value : [];
  return arr.slice(0, max);
}

// The full create/edit payload for one rule key, drawn from the guild's config.
export function buildRuleDefinition(key, cfg) {
  const def = RULE_DEFS[key];
  if (!def) return null;
  return {
    name: def.name,
    eventType: Event.MessageSend,
    triggerType: def.triggerType,
    triggerMetadata: def.triggerMetadata(cfg),
    actions: buildActions(def, cfg),
    enabled: true,
    exemptRoles: toIdArray(cfg.exemptRoles, 20),
    exemptChannels: toIdArray(cfg.exemptChannels, 50),
  };
}

// Which rule keys should exist given the current config. Empty when native
// AutoMod is switched off — a sync then removes every rule we own.
export function desiredRuleKeys(cfg) {
  if (!cfg.nativeEnabled) return [];
  return RULE_KEYS.filter((key) => cfg[key]);
}

// Does the bot have the permission Discord requires to manage AutoMod rules?
export function canManage(guild) {
  const me = guild?.members?.me;
  return Boolean(me?.permissions?.has(PermissionFlagsBits.ManageGuild));
}

// Reconcile the guild's AutoMod rules with the desired config: create missing
// rules, edit existing ones, and delete rules we own that are no longer wanted.
// Only touches rules whose name carries our prefix. Returns a result summary.
export async function syncNativeRules({ guild, automod, logger }) {
  if (!canManage(guild)) {
    return { ok: false, reason: "missing_permission" };
  }

  let existing;
  try {
    existing = await guild.autoModerationRules.fetch();
  } catch (err) {
    logger?.error?.({ err, guildId: guild?.id }, "native automod: fetch rules failed");
    return { ok: false, reason: "fetch_failed" };
  }

  const ours = new Map();
  for (const rule of existing.values()) {
    if (rule.name?.startsWith(RULE_PREFIX)) ours.set(rule.name, rule);
  }

  const wanted = new Set(desiredRuleKeys(automod).map((k) => RULE_DEFS[k].name));
  const summary = { ok: true, created: 0, updated: 0, removed: 0, failed: 0 };

  // Create or update every wanted rule.
  for (const key of desiredRuleKeys(automod)) {
    const def = RULE_DEFS[key];
    const payload = buildRuleDefinition(key, automod);
    const current = ours.get(def.name);
    try {
      if (current) {
        await current.edit(payload);
        summary.updated += 1;
      } else {
        await guild.autoModerationRules.create(payload);
        summary.created += 1;
      }
    } catch (err) {
      summary.failed += 1;
      logger?.error?.({ err, rule: def.name }, "native automod: create/edit failed");
    }
  }

  // Remove any rule we own that is no longer wanted.
  for (const [name, rule] of ours) {
    if (wanted.has(name)) continue;
    try {
      await rule.delete("Suzune AutoMod: rule disabled");
      summary.removed += 1;
    } catch (err) {
      summary.failed += 1;
      logger?.error?.({ err, rule: name }, "native automod: delete failed");
    }
  }

  return summary;
}

// Delete every AutoMod rule the bot provisioned in this guild.
export async function removeNativeRules({ guild, logger }) {
  if (!canManage(guild)) return { ok: false, reason: "missing_permission" };
  let existing;
  try {
    existing = await guild.autoModerationRules.fetch();
  } catch (err) {
    logger?.error?.({ err, guildId: guild?.id }, "native automod: fetch rules failed");
    return { ok: false, reason: "fetch_failed" };
  }
  const summary = { ok: true, removed: 0, failed: 0 };
  for (const rule of existing.values()) {
    if (!rule.name?.startsWith(RULE_PREFIX)) continue;
    try {
      await rule.delete("Suzune AutoMod: rules removed");
      summary.removed += 1;
    } catch (err) {
      summary.failed += 1;
      logger?.error?.({ err, rule: rule.name }, "native automod: delete failed");
    }
  }
  return summary;
}
