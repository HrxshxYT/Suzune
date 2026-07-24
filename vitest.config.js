import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    globals: false,
    // Run the whole suite in one process. re2-wasm (the automod regex engine) keeps
    // a single WebAssembly module instance; vitest's default per-file isolation
    // re-instantiates it across worker contexts, which intermittently corrupts
    // matches in unrelated files. Production is a single sequential process (stable),
    // so a single test fork matches that model and makes the suite deterministic.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // Dummy DATABASE_URL so PrismaClient can be constructed in unit tests
    // without a live database (queries are always mocked, never executed).
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/discordbot_test",
    },
  },
});
