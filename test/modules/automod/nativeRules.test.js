import { describe, it, expect, vi } from "vitest";
import {
  AutoModerationRuleTriggerType as Trigger,
  AutoModerationActionType as Action,
} from "discord.js";
import {
  AutoModerationRuleKeywordPresetType as Preset,
} from "discord.js";
import {
  RULE_PREFIX,
  RULE_KEYS,
  buildActions,
  buildRuleDefinition,
  buildEditPayload,
  desiredRuleKeys,
  canManage,
  syncNativeRules,
  removeNativeRules,
  RULE_DEFS,
} from "../../../src/modules/automod/native/rules.js";

const fullCfg = () => ({
  nativeEnabled: true,
  nativeInvites: true,
  nativeMentions: true,
  nativeSpam: true,
  nativePresets: true,
  nativeAlert: true,
  nativeAlertChannelId: "chan1",
  nativeTimeout: true,
  nativeTimeoutSeconds: 300,
  mentionLimit: 5,
  exemptRoles: ["r1"],
  exemptChannels: ["c1"],
});

describe("buildActions", () => {
  it("always blocks, and adds alert + timeout when enabled and allowed", () => {
    const acts = buildActions(RULE_DEFS.nativeInvites, fullCfg());
    const types = acts.map((a) => a.type);
    expect(types).toContain(Action.BlockMessage);
    expect(types).toContain(Action.SendAlertMessage);
    expect(types).toContain(Action.Timeout);
  });

  it("omits timeout on triggers that don't allow it (spam, presets)", () => {
    const spam = buildActions(RULE_DEFS.nativeSpam, fullCfg()).map((a) => a.type);
    expect(spam).not.toContain(Action.Timeout);
    const presets = buildActions(RULE_DEFS.nativePresets, fullCfg()).map((a) => a.type);
    expect(presets).not.toContain(Action.Timeout);
  });

  it("omits alert when no channel is set", () => {
    const cfg = { ...fullCfg(), nativeAlertChannelId: null };
    const types = buildActions(RULE_DEFS.nativeInvites, cfg).map((a) => a.type);
    expect(types).not.toContain(Action.SendAlertMessage);
  });

  it("clamps the timeout to Discord's 28-day ceiling", () => {
    const cfg = { ...fullCfg(), nativeTimeoutSeconds: 99_999_999 };
    const timeout = buildActions(RULE_DEFS.nativeMentions, cfg).find(
      (a) => a.type === Action.Timeout,
    );
    expect(timeout.metadata.durationSeconds).toBe(2419200);
  });
});

describe("buildRuleDefinition", () => {
  it("names rules with the shared prefix and carries exemptions", () => {
    const def = buildRuleDefinition("nativeInvites", fullCfg());
    expect(def.name.startsWith(RULE_PREFIX)).toBe(true);
    expect(def.triggerType).toBe(Trigger.Keyword);
    expect(def.exemptRoles).toEqual(["r1"]);
    expect(def.exemptChannels).toEqual(["c1"]);
  });

  it("clamps the mention limit into Discord's 1..50 range", () => {
    const def = buildRuleDefinition("nativeMentions", { ...fullCfg(), mentionLimit: 999 });
    expect(def.triggerMetadata.mentionTotalLimit).toBe(50);
  });

  it("returns null for an unknown key", () => {
    expect(buildRuleDefinition("nope", fullCfg())).toBeNull();
  });
});

describe("buildEditPayload", () => {
  it("omits the immutable triggerType", () => {
    const p = buildEditPayload("nativeInvites", fullCfg());
    expect(p.triggerType).toBeUndefined();
    expect(p.name).toContain(RULE_PREFIX);
    expect(p.actions.length).toBeGreaterThan(0);
  });

  it("unions existing keyword presets when adopting", () => {
    const existing = { triggerMetadata: { presets: [Preset.SexualContent] } };
    const p = buildEditPayload("nativePresets", fullCfg(), existing);
    expect(p.triggerMetadata.presets).toEqual(
      expect.arrayContaining([Preset.Profanity, Preset.Slurs, Preset.SexualContent]),
    );
  });
});

describe("desiredRuleKeys", () => {
  it("is empty when native AutoMod is disabled", () => {
    expect(desiredRuleKeys({ ...fullCfg(), nativeEnabled: false })).toEqual([]);
  });

  it("lists only the enabled rules", () => {
    const cfg = { ...fullCfg(), nativeSpam: false, nativePresets: false };
    expect(desiredRuleKeys(cfg)).toEqual(["nativeInvites", "nativeMentions"]);
  });
});

// Minimal guild double with an AutoMod rules manager.
function guild({ manage = true, rules = [] } = {}) {
  const store = new Map(rules.map((r) => [r.name, r]));
  return {
    id: "g1",
    members: { me: { permissions: { has: () => manage } } },
    autoModerationRules: {
      fetch: vi.fn(async () => store),
      create: vi.fn(async (payload) => {
        const rule = { ...payload, edit: vi.fn(), delete: vi.fn() };
        store.set(payload.name, rule);
        return rule;
      }),
    },
    _store: store,
  };
}

describe("canManage", () => {
  it("requires the Manage Server permission", () => {
    expect(canManage(guild({ manage: true }))).toBe(true);
    expect(canManage(guild({ manage: false }))).toBe(false);
    expect(canManage({})).toBe(false);
  });
});

describe("syncNativeRules", () => {
  it("refuses without the Manage Server permission", async () => {
    const res = await syncNativeRules({ guild: guild({ manage: false }), automod: fullCfg() });
    expect(res).toEqual({ ok: false, reason: "missing_permission" });
  });

  it("creates one rule per enabled key on a fresh guild", async () => {
    const g = guild();
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(RULE_KEYS.length);
    expect(g.autoModerationRules.create).toHaveBeenCalledTimes(RULE_KEYS.length);
  });

  it("edits an existing rule instead of recreating it", async () => {
    const existing = {
      name: `${RULE_PREFIX}Invite Links`,
      edit: vi.fn(),
      delete: vi.fn(),
    };
    const g = guild({ rules: [existing] });
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(existing.edit).toHaveBeenCalledOnce();
    expect(res.updated).toBe(1);
    expect(res.created).toBe(RULE_KEYS.length - 1);
  });

  it("removes an owned rule that is no longer wanted", async () => {
    const stale = { name: `${RULE_PREFIX}Spam`, edit: vi.fn(), delete: vi.fn() };
    const g = guild({ rules: [stale] });
    const res = await syncNativeRules({
      guild: g,
      automod: { ...fullCfg(), nativeSpam: false },
    });
    expect(stale.delete).toHaveBeenCalledOnce();
    expect(res.removed).toBe(1);
  });

  it("adopts an existing singleton rule by reclaiming its slot (delete + create)", async () => {
    // Guild already has a MentionSpam rule (type 5) the server made — Discord
    // allows only one, so sync deletes it and creates our managed rule.
    const foreignMention = {
      name: "Server Mention Guard",
      triggerType: Trigger.MentionSpam,
      edit: vi.fn(),
      delete: vi.fn(),
    };
    const g = guild({ rules: [foreignMention] });
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(foreignMention.delete).toHaveBeenCalledOnce();
    expect(res.adopted).toBe(1);
    // Invites, spam, presets created outright; mentions reclaimed → all created.
    expect(res.created).toBe(RULE_KEYS.length - 1);
    expect(g.autoModerationRules.create).toHaveBeenCalledWith(
      expect.objectContaining({ triggerType: Trigger.MentionSpam }),
    );
  });

  it("still creates our rule when the conflicting rule can't be deleted (404)", async () => {
    const stuck = {
      name: "Discord raid protection",
      triggerType: Trigger.MentionSpam,
      delete: vi.fn(async () => {
        throw new Error("404: Not Found");
      }),
    };
    const g = guild({ rules: [stuck] });
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(res.adopted).toBe(1);
    expect(g.autoModerationRules.create).toHaveBeenCalledWith(
      expect.objectContaining({ triggerType: Trigger.MentionSpam }),
    );
  });

  it("recreates our own rule if editing it 404s", async () => {
    const orphan = {
      name: `${RULE_PREFIX}Invite Links`,
      triggerType: 1,
      edit: vi.fn(async () => {
        throw new Error("404: Not Found");
      }),
      delete: vi.fn(),
    };
    const g = guild({ rules: [orphan] });
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(orphan.edit).toHaveBeenCalledOnce();
    expect(res.created).toBe(RULE_KEYS.length); // invites recreated + the other three
  });

  it("never touches rules the server made by hand", async () => {
    const foreign = { name: "My own rule", edit: vi.fn(), delete: vi.fn() };
    const g = guild({ rules: [foreign] });
    await syncNativeRules({ guild: g, automod: { ...fullCfg(), nativeEnabled: false } });
    expect(foreign.delete).not.toHaveBeenCalled();
  });
});

describe("removeNativeRules", () => {
  it("deletes only our prefixed rules", async () => {
    const ours = { name: `${RULE_PREFIX}Spam`, delete: vi.fn() };
    const foreign = { name: "Server rule", delete: vi.fn() };
    const g = guild({ rules: [ours, foreign] });
    const res = await removeNativeRules({ guild: g });
    expect(ours.delete).toHaveBeenCalledOnce();
    expect(foreign.delete).not.toHaveBeenCalled();
    expect(res.removed).toBe(1);
  });
});
