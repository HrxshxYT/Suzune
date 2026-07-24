import {
  AutoModerationRuleTriggerType as Trigger,
  AutoModerationActionType as Action,
  AutoModerationRuleEventType as Event,
  AutoModerationRuleKeywordPresetType as Preset,
  PermissionFlagsBits,
} from "discord.js";
import { PACKS } from "../rules/packs/index.js";

// All bot-provisioned rules share this prefix so we can find and reconcile our
// own rules on every sync without clobbering rules the server made by hand.
export const RULE_PREFIX = "Suzune • ";

const BLOCK_MESSAGE = "This message was blocked by Suzune AutoMod.";
const MAX_TIMEOUT_SEC = 2419200; // Discord's 28-day ceiling.

// Config columns the panel exposes as individual protection toggles. These are
// the user-facing categories; several are packed into one Discord rule below so
// we stay well under Discord's six-Keyword-rule ceiling.
export const RULE_KEYS = [
  "nativeInvites",
  "nativeScamLinks",
  "nativeGrabbers",
  "nativeNitroScams",
  "nativeCryptoScams",
  "nativeAdSpam",
  "nativeMentions",
  "nativeSpam",
  "nativePresets",
];

// Aggregate the native-projection metadata from every enabled pack into flat
// keyword/regex lists the RULE_BUILDERS can consume. Confusables/heat/edit-
// distance stay runtime-only — only literal keyword/regex rules project here.
export function nativeProjection(packStates) {
  const enabled = new Set(packStates.filter((p) => p.enabled).map((p) => p.packId));
  const keywordFilter = [];
  const regexPatterns = [];
  for (const pack of PACKS) {
    if (!enabled.has(pack.id)) continue;
    for (const r of pack.rules) {
      if (r.native?.keywordFilter) keywordFilter.push(...r.native.keywordFilter);
      if (r.native?.regexPatterns) regexPatterns.push(...r.native.regexPatterns);
    }
  }
  return { keywordFilter: [...new Set(keywordFilter)], regexPatterns: [...new Set(regexPatterns)] };
}

// ── Keyword / regex source lists ────────────────────────────────────────────
const INVITE_KW = [
  "discord.gg/*",
  "discord.com/invite/*",
  "discordapp.com/invite/*",
  "discord.io/*",
  "discord.me/*",
  "dsc.gg/*",
  "invite.gg/*",
];
const INVITE_RX = [
  "(?i)discord(?:app)?\\.com/invite/[a-z0-9-]+",
  "(?i)discord\\.(gg|io|me|li)/[a-z0-9-]+",
];
const SCAM_KW = [
  "discordnitro*",
  "discord-nitro*",
  "discordgift*",
  "discord-gift*",
  "nitro-discord*",
  "dlscord*",
  "disc0rd*",
  "discrod*",
  "steam-gift*",
  "steamnitro*",
  "*free-nitro*",
];
const SCAM_RX = [
  "(?i)https?://[^\\s/]*(dlscord|disc0rd|discrod|dlscordapp|discord-?nitro|discord-?gift|nitro-?discord|free-?nitro)",
  "(?i)https?://[^\\s/]*(steamcommunity|steam-?community)[^\\s]*(gift|trade|nitro|award|free)",
];
const GRABBER_KW = [
  "grabify.link*",
  "iplogger.org*",
  "iplogger.com*",
  "iplogger.ru*",
  "iplogger.co*",
  "2no.co*",
  "yip.su*",
  "iplis.ru*",
  "02ip.ru*",
  "ezstat.ru*",
  "blasze.tk*",
  "ps3cfw.com*",
  "lovebird.guru*",
  "trulove.guru*",
  "dateing.club*",
  "shrekis.life*",
  "headshot.monster*",
  "gaming-at-my.best*",
  "screenshot.click*",
  "imageshare.best*",
  "quickmessage.us*",
  "catsnthings.fun*",
  "joinmy.site*",
];
const GRABBER_RX = ["(?i)https?://[^\\s/]*(grabify|iplogger|ipgrab|2no\\.co|yip\\.su|ezstat|blasze)"];
const NITRO_KW = [
  "*free nitro*",
  "*free discord nitro*",
  "*nitro giveaway*",
  "*claim your nitro*",
  "*get free nitro*",
  "*free steam gift*",
  "*steam gift card*",
  "*nitro for free*",
  "*discord nitro free*",
  "*free @everyone nitro*",
];
const CRYPTO_KW = [
  "*free crypto*",
  "*crypto giveaway*",
  "*bitcoin giveaway*",
  "*eth giveaway*",
  "*airdrop*",
  "*claim your airdrop*",
  "*connect your wallet*",
  "*double your bitcoin*",
  "*free bitcoin*",
  "*nft giveaway*",
  "*wallet drainer*",
];
const ADSPAM_KW = [
  "*cheap boost*",
  "*cheap boosts*",
  "*cheap boosting*",
  "*cheap nitro*",
  "*boosting service*",
  "*selling accounts*",
  "*buy followers*",
  "*sell nitro*",
  "*dm me for promo*",
  "*dm for cheap*",
  "*server boosting cheap*",
];

const pick = (on, list) => (on ? list : []);

// ── Rule builders ───────────────────────────────────────────────────────────
// Each builder yields a rule's trigger metadata from config, or null when every
// category feeding it is off (so the rule shouldn't exist). Six categories are
// packed into three Keyword rules, keeping us to 3 of Discord's 6 Keyword slots
// and leaving room for the server's own rules.
export const RULE_BUILDERS = [
  {
    name: `${RULE_PREFIX}Invite Links`,
    triggerType: Trigger.Keyword,
    timeoutAllowed: true,
    build: (cfg) =>
      cfg.nativeInvites ? { keywordFilter: INVITE_KW, regexPatterns: INVITE_RX } : null,
  },
  {
    name: `${RULE_PREFIX}Malicious Links`,
    triggerType: Trigger.Keyword,
    timeoutAllowed: true,
    build: (cfg) => {
      if (!cfg.nativeScamLinks && !cfg.nativeGrabbers) return null;
      return {
        keywordFilter: [...pick(cfg.nativeScamLinks, SCAM_KW), ...pick(cfg.nativeGrabbers, GRABBER_KW)],
        regexPatterns: [...pick(cfg.nativeScamLinks, SCAM_RX), ...pick(cfg.nativeGrabbers, GRABBER_RX)],
      };
    },
  },
  {
    name: `${RULE_PREFIX}Scam & Spam Text`,
    triggerType: Trigger.Keyword,
    timeoutAllowed: true,
    build: (cfg) => {
      const keywordFilter = [
        ...pick(cfg.nativeNitroScams, NITRO_KW),
        ...pick(cfg.nativeCryptoScams, CRYPTO_KW),
        ...pick(cfg.nativeAdSpam, ADSPAM_KW),
      ];
      return keywordFilter.length ? { keywordFilter } : null;
    },
  },
  {
    name: `${RULE_PREFIX}Mention Spam`,
    triggerType: Trigger.MentionSpam,
    timeoutAllowed: true,
    build: (cfg) =>
      cfg.nativeMentions
        ? {
            mentionTotalLimit: Math.max(1, Math.min(50, cfg.mentionLimit ?? 5)),
            mentionRaidProtectionEnabled: true,
          }
        : null,
  },
  {
    name: `${RULE_PREFIX}Spam`,
    triggerType: Trigger.Spam,
    timeoutAllowed: false,
    build: (cfg) => (cfg.nativeSpam ? {} : null),
  },
  {
    name: `${RULE_PREFIX}Profanity & Slurs`,
    triggerType: Trigger.KeywordPreset,
    timeoutAllowed: false,
    build: (cfg) => (cfg.nativePresets ? { presets: [Preset.Profanity, Preset.Slurs], allowList: [] } : null),
  },
];

// Trigger types Discord permits only ONE rule of per guild.
export const SINGLETON_TRIGGERS = new Set([
  Trigger.Spam,
  Trigger.KeywordPreset,
  Trigger.MentionSpam,
]);

// The action list for a rule: always block; alert when a channel is set; time
// the offender out when enabled and the trigger supports it.
export function buildActions(builder, cfg) {
  const actions = [{ type: Action.BlockMessage, metadata: { customMessage: BLOCK_MESSAGE } }];
  if (cfg.nativeAlert && cfg.nativeAlertChannelId) {
    actions.push({ type: Action.SendAlertMessage, metadata: { channel: cfg.nativeAlertChannelId } });
  }
  if (cfg.nativeTimeout && builder.timeoutAllowed) {
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
  return (Array.isArray(value) ? value : []).slice(0, max);
}

// The full create payload for a builder, or null if the rule shouldn't exist.
// When replacing a KeywordPreset rule, its presets are unioned with ours.
export function buildRuleDefinition(builder, cfg, existingRule = null) {
  const meta = builder.build(cfg);
  if (!meta) return null;
  let triggerMetadata = meta;
  if (builder.triggerType === Trigger.KeywordPreset && existingRule?.triggerMetadata?.presets?.length) {
    triggerMetadata = {
      ...meta,
      presets: [...new Set([...existingRule.triggerMetadata.presets, ...(meta.presets ?? [])])],
    };
  }
  return {
    name: builder.name,
    eventType: Event.MessageSend,
    triggerType: builder.triggerType,
    triggerMetadata,
    actions: buildActions(builder, cfg),
    enabled: true,
    exemptRoles: toIdArray(cfg.exemptRoles, 20),
    exemptChannels: toIdArray(cfg.exemptChannels, 50),
  };
}

// Edit payload = create payload minus the immutable `triggerType`.
export function buildEditPayload(builder, cfg, existingRule) {
  const base = buildRuleDefinition(builder, cfg, existingRule);
  if (!base) return null;
  delete base.triggerType;
  return base;
}

// The rule names we want to exist given the current config (empty if native
// AutoMod is off — a sync then removes every rule we own).
export function wantedRuleNames(cfg) {
  if (!cfg.nativeEnabled) return new Set();
  return new Set(RULE_BUILDERS.filter((b) => b.build(cfg)).map((b) => b.name));
}

// Category columns currently enabled — used by the panel/tests.
export function desiredRuleKeys(cfg) {
  if (!cfg.nativeEnabled) return [];
  return RULE_KEYS.filter((key) => cfg[key]);
}

// Does the bot have the permission Discord requires to manage AutoMod rules?
export function canManage(guild) {
  const me = guild?.members?.me;
  return Boolean(me?.permissions?.has(PermissionFlagsBits.ManageGuild));
}

// Remove a rule: delete it, or — for rules Discord won't let us delete (e.g. a
// community server's mention raid-protection) — disable it instead.
async function removeRule(guild, rule, logger) {
  try {
    await rule.delete("Suzune AutoMod: rule disabled");
    return true;
  } catch {
    try {
      await rule.edit({ enabled: false });
      return true;
    } catch (err) {
      logger?.warn?.({ err: err?.message, rule: rule.name }, "native automod: could not remove rule");
      return false;
    }
  }
}

// Apply a builder to an existing rule by editing it in place. If the edit fails
// (a stale/orphaned rule can 404), reclaim the slot: delete then create fresh.
async function editOrReplace(guild, rule, builder, cfg, logger) {
  try {
    await rule.edit(buildEditPayload(builder, cfg, rule));
    return;
  } catch (editErr) {
    logger?.warn?.({ err: editErr?.message, rule: builder.name }, "native automod: edit failed, replacing");
    try {
      await rule.delete("Suzune AutoMod: replacing orphaned rule");
    } catch {
      // Undeletable or already gone — the slot may now be free.
    }
    await guild.autoModerationRules.create(buildRuleDefinition(builder, cfg, rule));
  }
}

// Reconcile the guild's AutoMod rules with the desired config. Removes unwanted
// rules first (freeing slots), then creates/edits/adopts wanted ones. Only ever
// touches rules whose name carries our prefix, except to reuse a singleton slot.
export async function syncNativeRules({ guild, automod, logger }) {
  if (!canManage(guild)) return { ok: false, reason: "missing_permission" };

  let existing;
  try {
    existing = await guild.autoModerationRules.fetch();
  } catch (err) {
    logger?.error?.({ err, guildId: guild?.id }, "native automod: fetch rules failed");
    return { ok: false, reason: "fetch_failed" };
  }

  const ours = new Map();
  const byTrigger = new Map();
  for (const rule of existing.values()) {
    if (rule.name?.startsWith(RULE_PREFIX)) ours.set(rule.name, rule);
    const list = byTrigger.get(rule.triggerType) ?? [];
    list.push(rule);
    byTrigger.set(rule.triggerType, list);
  }

  const wanted = wantedRuleNames(automod);
  const summary = { ok: true, created: 0, updated: 0, adopted: 0, removed: 0, failed: 0 };

  // 1. Remove any rule we own that is no longer wanted — frees slots first so a
  //    rename/consolidation doesn't transiently exceed the per-type cap.
  for (const [name, rule] of ours) {
    if (wanted.has(name)) continue;
    if (await removeRule(guild, rule, logger)) summary.removed += 1;
    else summary.failed += 1;
  }

  // 2. Create / edit / adopt every wanted rule.
  for (const builder of RULE_BUILDERS) {
    if (!wanted.has(builder.name)) continue;
    const current = ours.get(builder.name);
    const conflict =
      !current && SINGLETON_TRIGGERS.has(builder.triggerType)
        ? (byTrigger.get(builder.triggerType) ?? []).find((r) => !r.name?.startsWith(RULE_PREFIX))
        : null;
    try {
      if (current) {
        await editOrReplace(guild, current, builder, automod, logger);
        summary.updated += 1;
      } else if (conflict) {
        // Reuse the single slot by editing the server's existing rule in place
        // (deleting isn't always allowed — e.g. community raid protection).
        await editOrReplace(guild, conflict, builder, automod, logger);
        summary.adopted += 1;
      } else {
        await guild.autoModerationRules.create(buildRuleDefinition(builder, automod));
        summary.created += 1;
      }
    } catch (err) {
      summary.failed += 1;
      logger?.warn?.({ err: err?.message, rule: builder.name }, "native automod: rule sync failed");
    }
  }

  return summary;
}

// Remove every AutoMod rule the bot provisioned in this guild (disabling any
// that Discord won't let us delete).
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
    if (await removeRule(guild, rule, logger)) summary.removed += 1;
    else summary.failed += 1;
  }
  return summary;
}
