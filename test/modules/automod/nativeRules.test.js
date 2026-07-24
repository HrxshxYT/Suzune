import { describe, it, expect, vi } from "vitest";
import {
  AutoModerationRuleTriggerType as Trigger,
  AutoModerationActionType as Action,
} from "discord.js";
import {
  RULE_PREFIX,
  RULE_KEYS,
  RULE_BUILDERS,
  buildActions,
  buildRuleDefinition,
  buildEditPayload,
  desiredRuleKeys,
  wantedRuleNames,
  canManage,
  syncNativeRules,
  removeNativeRules,
  nativeProjection,
} from "../../../src/modules/automod/native/rules.js";

// Builders keyed by their label (name minus the prefix).
const B = Object.fromEntries(RULE_BUILDERS.map((b) => [b.name.slice(RULE_PREFIX.length), b]));

const fullCfg = () => ({
  nativeEnabled: true,
  nativeInvites: true,
  nativeScamLinks: true,
  nativeGrabbers: true,
  nativeNitroScams: true,
  nativeCryptoScams: true,
  nativeAdSpam: true,
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

describe("RULE_BUILDERS", () => {
  it("is six rules using only three of Discord's six Keyword slots", () => {
    expect(RULE_BUILDERS).toHaveLength(6);
    const keyword = RULE_BUILDERS.filter((b) => b.triggerType === Trigger.Keyword);
    expect(keyword).toHaveLength(3);
  });

  it("exposes nine user-facing category toggles", () => {
    expect(RULE_KEYS).toHaveLength(9);
  });
});

describe("buildActions", () => {
  it("always blocks, and adds alert + timeout when enabled and allowed", () => {
    const types = buildActions(B["Invite Links"], fullCfg()).map((a) => a.type);
    expect(types).toContain(Action.BlockMessage);
    expect(types).toContain(Action.SendAlertMessage);
    expect(types).toContain(Action.Timeout);
  });

  it("omits timeout on triggers that don't allow it (spam, presets)", () => {
    expect(buildActions(B.Spam, fullCfg()).map((a) => a.type)).not.toContain(Action.Timeout);
    expect(buildActions(B["Profanity & Slurs"], fullCfg()).map((a) => a.type)).not.toContain(
      Action.Timeout,
    );
  });

  it("omits alert when no channel is set", () => {
    const cfg = { ...fullCfg(), nativeAlertChannelId: null };
    expect(buildActions(B["Invite Links"], cfg).map((a) => a.type)).not.toContain(
      Action.SendAlertMessage,
    );
  });

  it("clamps the timeout to Discord's 28-day ceiling", () => {
    const cfg = { ...fullCfg(), nativeTimeoutSeconds: 99_999_999 };
    const timeout = buildActions(B["Mention Spam"], cfg).find((a) => a.type === Action.Timeout);
    expect(timeout.metadata.durationSeconds).toBe(2419200);
  });
});

describe("rule composition", () => {
  it("Malicious Links unions scam + grabber lists per the toggles", () => {
    const scamOnly = B["Malicious Links"].build({ nativeScamLinks: true, nativeGrabbers: false });
    expect(scamOnly.keywordFilter.some((k) => k.includes("discord-nitro"))).toBe(true);
    expect(scamOnly.keywordFilter.some((k) => k.includes("grabify"))).toBe(false);

    const both = B["Malicious Links"].build({ nativeScamLinks: true, nativeGrabbers: true });
    expect(both.keywordFilter.some((k) => k.includes("grabify"))).toBe(true);

    expect(B["Malicious Links"].build({ nativeScamLinks: false, nativeGrabbers: false })).toBeNull();
  });

  it("Scam & Spam Text packs nitro + crypto + ad categories, null when all off", () => {
    const nitroOnly = B["Scam & Spam Text"].build({ nativeNitroScams: true });
    expect(nitroOnly.keywordFilter.some((k) => k.includes("free nitro"))).toBe(true);
    expect(B["Scam & Spam Text"].build({})).toBeNull();
  });
});

describe("buildRuleDefinition", () => {
  it("names rules with the shared prefix and carries exemptions", () => {
    const def = buildRuleDefinition(B["Invite Links"], fullCfg());
    expect(def.name.startsWith(RULE_PREFIX)).toBe(true);
    expect(def.triggerType).toBe(Trigger.Keyword);
    expect(def.exemptRoles).toEqual(["r1"]);
    expect(def.exemptChannels).toEqual(["c1"]);
  });

  it("clamps the mention limit into Discord's 1..50 range", () => {
    const def = buildRuleDefinition(B["Mention Spam"], { ...fullCfg(), mentionLimit: 999 });
    expect(def.triggerMetadata.mentionTotalLimit).toBe(50);
  });

  it("returns null when the rule's categories are all off", () => {
    expect(buildRuleDefinition(B["Invite Links"], { ...fullCfg(), nativeInvites: false })).toBeNull();
  });
});

describe("buildEditPayload", () => {
  it("omits the immutable triggerType", () => {
    const p = buildEditPayload(B["Invite Links"], fullCfg());
    expect(p.triggerType).toBeUndefined();
    expect(p.name).toContain(RULE_PREFIX);
  });

  it("unions existing keyword presets when adopting", () => {
    const existing = { triggerMetadata: { presets: [2] } }; // SexualContent
    const p = buildEditPayload(B["Profanity & Slurs"], fullCfg(), existing);
    expect(p.triggerMetadata.presets).toEqual(expect.arrayContaining([1, 2, 3]));
  });
});

describe("wantedRuleNames / desiredRuleKeys", () => {
  it("is empty when native AutoMod is disabled", () => {
    expect(wantedRuleNames({ ...fullCfg(), nativeEnabled: false }).size).toBe(0);
    expect(desiredRuleKeys({ ...fullCfg(), nativeEnabled: false })).toEqual([]);
  });

  it("wants all six rules when fully enabled", () => {
    expect(wantedRuleNames(fullCfg()).size).toBe(6);
    expect(desiredRuleKeys(fullCfg())).toHaveLength(9);
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

  it("creates all six rules on a fresh guild", async () => {
    const g = guild();
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(6);
    expect(g.autoModerationRules.create).toHaveBeenCalledTimes(6);
  });

  it("edits an existing owned rule instead of recreating it", async () => {
    const existing = {
      name: `${RULE_PREFIX}Invite Links`,
      triggerType: Trigger.Keyword,
      edit: vi.fn(),
      delete: vi.fn(),
    };
    const g = guild({ rules: [existing] });
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(existing.edit).toHaveBeenCalledOnce();
    expect(res.updated).toBe(1);
    expect(res.created).toBe(5);
  });

  it("removes an owned rule that is no longer wanted", async () => {
    const stale = {
      name: `${RULE_PREFIX}Spam`,
      triggerType: Trigger.Spam,
      edit: vi.fn(),
      delete: vi.fn(),
    };
    const g = guild({ rules: [stale] });
    const res = await syncNativeRules({ guild: g, automod: { ...fullCfg(), nativeSpam: false } });
    expect(stale.delete).toHaveBeenCalledOnce();
    expect(res.removed).toBe(1);
  });

  it("adopts a server's singleton rule by editing it in place (not deleting)", async () => {
    const foreignMention = {
      name: "Server Mention Guard",
      triggerType: Trigger.MentionSpam,
      edit: vi.fn(),
      delete: vi.fn(),
    };
    const g = guild({ rules: [foreignMention] });
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(foreignMention.edit).toHaveBeenCalledOnce();
    expect(foreignMention.delete).not.toHaveBeenCalled(); // community rules can't be deleted
    expect(res.adopted).toBe(1);
  });

  it("recreates an owned rule whose edit 404s", async () => {
    const orphan = {
      name: `${RULE_PREFIX}Invite Links`,
      triggerType: Trigger.Keyword,
      edit: vi.fn(async () => {
        throw new Error("404: Not Found");
      }),
      delete: vi.fn(),
    };
    const g = guild({ rules: [orphan] });
    const res = await syncNativeRules({ guild: g, automod: fullCfg() });
    expect(orphan.edit).toHaveBeenCalledOnce();
    expect(g.autoModerationRules.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: `${RULE_PREFIX}Invite Links` }),
    );
  });

  it("never touches rules the server made by hand", async () => {
    const foreign = { name: "My own rule", triggerType: Trigger.Keyword, edit: vi.fn(), delete: vi.fn() };
    const g = guild({ rules: [foreign] });
    await syncNativeRules({ guild: g, automod: { ...fullCfg(), nativeEnabled: false } });
    expect(foreign.delete).not.toHaveBeenCalled();
    expect(foreign.edit).not.toHaveBeenCalled();
  });
});

describe("removeNativeRules", () => {
  it("deletes only our prefixed rules", async () => {
    const ours = { name: `${RULE_PREFIX}Spam`, delete: vi.fn(), edit: vi.fn() };
    const foreign = { name: "Server rule", delete: vi.fn(), edit: vi.fn() };
    const g = guild({ rules: [ours, foreign] });
    const res = await removeNativeRules({ guild: g });
    expect(ours.delete).toHaveBeenCalledOnce();
    expect(foreign.delete).not.toHaveBeenCalled();
    expect(res.removed).toBe(1);
  });

  it("disables a rule that can't be deleted (community raid protection)", async () => {
    const protectedRule = {
      name: `${RULE_PREFIX}Mention Spam`,
      delete: vi.fn(async () => {
        throw new Error("cannot be deleted from community servers");
      }),
      edit: vi.fn(),
    };
    const g = guild({ rules: [protectedRule] });
    const res = await removeNativeRules({ guild: g });
    expect(protectedRule.edit).toHaveBeenCalledWith({ enabled: false });
    expect(res.removed).toBe(1);
  });
});

describe("nativeProjection", () => {
  it("collects keyword filters from enabled packs", () => {
    const proj = nativeProjection([{ packId: "grabbers", enabled: true }]);
    expect(proj.keywordFilter).toContain("grabify.link*");
  });
  it("omits disabled packs", () => {
    const proj = nativeProjection([{ packId: "grabbers", enabled: false }]);
    expect(proj.keywordFilter).not.toContain("grabify.link*");
  });
});
