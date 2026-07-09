import { describe, it, expect } from "vitest";
import { buildCommandMap, toJSON } from "../../src/core/CommandHandler.js";

const cmd = (name) => ({
  data: { name, toJSON: () => ({ name }) },
  execute: async () => {},
});

describe("buildCommandMap", () => {
  it("maps commands by name", () => {
    const map = buildCommandMap([cmd("ping"), cmd("ban")]);
    expect(map.size).toBe(2);
    expect(map.get("ping").data.name).toBe("ping");
  });

  it("throws on duplicate command names", () => {
    expect(() => buildCommandMap([cmd("ping"), cmd("ping")])).toThrow(/duplicate/i);
  });
});

describe("toJSON", () => {
  it("serializes each command's data", () => {
    const map = buildCommandMap([cmd("ping")]);
    expect(toJSON(map)).toEqual([{ name: "ping" }]);
  });
});
