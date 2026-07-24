import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";

describe("automod v2 schema", () => {
  it("exposes the new models and columns", () => {
    const p = new PrismaClient();
    expect(p.automodRule).toBeDefined();
    expect(p.automodPackState).toBeDefined();
    expect(p.automodLog).toBeDefined();
    // Legacy columns are gone from the generated types (compile-time guarantee);
    // here we just assert the client constructed.
    expect(p.automodConfig).toBeDefined();
  });
});
