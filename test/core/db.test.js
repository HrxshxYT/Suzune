import { describe, it, expect } from "vitest";
import { createPrisma } from "../../src/core/db.js";

describe("createPrisma", () => {
  it("returns the same instance on repeated calls", () => {
    const a = createPrisma();
    const b = createPrisma();
    expect(a).toBe(b);
  });
});
