import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { canUseCommand } from "../../src/core/PermissionService.js";

const member = (perms = [], roleIds = []) => ({
  permissions: { has: (p) => perms.includes(p) },
  roles: { cache: new Map(roleIds.map((id) => [id, { id }])) },
});

describe("canUseCommand", () => {
  it("allows commands with no permission requirement", () => {
    const res = canUseCommand({ member: member(), command: { permissions: [] }, modRoleIds: [] });
    expect(res.ok).toBe(true);
  });

  it("allows when the member holds a required Discord permission", () => {
    const cmd = { permissions: [PermissionFlagsBits.BanMembers] };
    const res = canUseCommand({
      member: member([PermissionFlagsBits.BanMembers]),
      command: cmd,
      modRoleIds: [],
    });
    expect(res.ok).toBe(true);
  });

  it("allows when the member has a configured mod role", () => {
    const cmd = { permissions: [PermissionFlagsBits.BanMembers] };
    const res = canUseCommand({
      member: member([], ["modrole1"]),
      command: cmd,
      modRoleIds: ["modrole1"],
    });
    expect(res.ok).toBe(true);
  });

  it("blocks when neither permission nor mod role is present", () => {
    const cmd = { permissions: [PermissionFlagsBits.BanMembers] };
    const res = canUseCommand({ member: member(), command: cmd, modRoleIds: ["modrole1"] });
    expect(res).toEqual({ ok: false, reason: "missing_permission" });
  });
});
