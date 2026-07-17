import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loginWithRetry } from "../src/bot.js";

function httpError(status) {
  const e = new Error("Internal Server Error");
  e.status = status;
  return e;
}

describe("loginWithRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("logs in once when Discord answers", async () => {
    const client = { login: vi.fn(async () => "ok") };
    await loginWithRetry(client, "token", null);
    expect(client.login).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 5xx and eventually succeeds", async () => {
    let n = 0;
    const client = {
      login: vi.fn(async () => {
        n += 1;
        if (n < 3) throw httpError(500);
        return "ok";
      }),
    };
    const warn = vi.fn();
    const p = loginWithRetry(client, "token", { warn });
    await vi.advanceTimersByTimeAsync(5000); // first backoff
    await vi.advanceTimersByTimeAsync(10000); // second backoff
    await p;
    expect(client.login).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("aborts immediately on an invalid token", async () => {
    const err = new Error("invalid");
    err.code = "TokenInvalid";
    const client = { login: vi.fn(async () => { throw err; }) };
    await expect(loginWithRetry(client, "token", null)).rejects.toBe(err);
    expect(client.login).toHaveBeenCalledTimes(1);
  });

  it("aborts immediately on 401/403", async () => {
    const client = { login: vi.fn(async () => { throw httpError(401); }) };
    await expect(loginWithRetry(client, "token", null)).rejects.toBeTruthy();
    expect(client.login).toHaveBeenCalledTimes(1);
  });
});
