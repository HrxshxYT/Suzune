import { formatGuardStatus, createDebouncer, STATUS_DEBOUNCE_MS } from "./status.js";
import { lockOverwrites, missingLockPermissions } from "./lock.js";
import { shouldReturnToPost, backoffMs, MAX_RECONNECT_ATTEMPTS } from "./reconnect.js";

// Orchestrates the "guard" presence: locks a voice channel, joins it silently,
// keeps a live member-count status, and holds the channel across restarts/moves.
// All gateway/REST interaction goes through injected `deps` so the logic is
// testable without a live connection.
export class WatchVcService {
  constructor({ client, logger, config, deps, debounceMs = STATUS_DEBOUNCE_MS }) {
    this.client = client;
    this.logger = logger;
    this.config = config;
    this.deps = deps;
    this.debouncer = createDebouncer(debounceMs);
    this.connections = new Map(); // guildId -> { channelId, connection }
    this.reconnectAttempts = new Map(); // guildId -> number
    this.reconnectTimers = new Map(); // guildId -> timer
  }

  currentChannelId(guildId) {
    return this.connections.get(guildId)?.channelId ?? null;
  }

  // Enable guarding on a channel (persists channelId + enabled=true).
  async enable(channel) {
    return this._engage(channel, true);
  }

  // Re-apply lock + rejoin + refresh status for the configured channel.
  async reassert(guildId) {
    const gc = await this.config.getGuild(guildId);
    const cfg = gc?.watchVc;
    if (!cfg?.enabled) return { ok: false, error: "Guarding is disabled." };
    if (!cfg.channelId) return { ok: false, error: "No channel configured." };
    const channel = await this._resolveChannel(cfg.channelId);
    if (!channel) return { ok: false, error: "Configured channel not found." };
    return this._engage(channel, false);
  }

  async _engage(channel, persist) {
    const me = channel.guild?.members?.me;
    if (!me) return { ok: false, error: "Bot member not available." };

    const missing = missingLockPermissions(channel.permissionsFor(me));
    if (missing.length) {
      return { ok: false, error: `Missing permissions: ${missing.join(", ")}.` };
    }

    try {
      await channel.permissionOverwrites.set(
        lockOverwrites(channel.guild.roles.everyone.id, me.id),
      );
      const connection = this.deps.join(channel);
      await this.deps.ready(connection, 15000);
      this.deps.onDisconnect(connection, () => this._scheduleReconnect(channel.guildId));
      this.connections.set(channel.guildId, { channelId: channel.id, connection });
      await this.deps.setStatus(channel.id, formatGuardStatus(channel.guild.memberCount));
      if (persist) {
        await this.config.updateWatchVc(channel.guildId, {
          channelId: channel.id,
          enabled: true,
        });
      }
      this.reconnectAttempts.delete(channel.guildId);
      return { ok: true };
    } catch (err) {
      this.logger?.error?.({ err, guildId: channel.guildId }, "watchvc engage failed");
      return { ok: false, error: err?.message ?? "Failed to join the channel." };
    }
  }

  async disable(guildId) {
    await this.config.updateWatchVc(guildId, { enabled: false });
    const entry = this.connections.get(guildId);
    if (entry) {
      this.deps.destroy(entry.connection);
      await this.deps.clearStatus(entry.channelId).catch((err) =>
        this.logger?.warn?.({ err, guildId }, "watchvc clear status failed"),
      );
      this.connections.delete(guildId);
    }
    this.debouncer.cancel(guildId);
    this._clearReconnect(guildId);
  }

  // Debounced live status refresh; no-op unless we're actively guarding the guild.
  refreshStatus(guildId) {
    if (!this.connections.has(guildId)) return;
    this.debouncer.schedule(guildId, () => this._doRefresh(guildId));
  }

  _doRefresh(guildId) {
    const entry = this.connections.get(guildId);
    if (!entry) return;
    const guild = this.client.guilds?.cache?.get(guildId);
    if (!guild) return;
    this.deps
      .setStatus(entry.channelId, formatGuardStatus(guild.memberCount))
      .catch((err) => this.logger?.warn?.({ err, guildId }, "watchvc status refresh failed"));
  }

  // Startup: rejoin every guild that has guarding enabled.
  async restoreAll() {
    const guilds = this.client.guilds?.cache;
    if (!guilds) return;
    for (const [guildId] of guilds) {
      try {
        const gc = await this.config.getGuild(guildId);
        const cfg = gc?.watchVc;
        if (!cfg?.enabled || !cfg.channelId) continue;
        const channel = await this._resolveChannel(cfg.channelId);
        if (channel) await this._engage(channel, false);
      } catch (err) {
        this.logger?.warn?.({ err, guildId }, "watchvc restore failed");
      }
    }
  }

  // Return to post if the bot itself was moved/disconnected off the configured channel.
  async handleVoiceStateUpdate(oldState, newState) {
    if (newState.id !== this.client.user?.id) return;
    const guildId = newState.guild?.id;
    if (!guildId) return;
    const gc = await this.config.getGuild(guildId);
    const cfg = gc?.watchVc;
    if (
      shouldReturnToPost({
        enabled: cfg?.enabled,
        configuredChannelId: cfg?.channelId,
        currentChannelId: newState.channelId,
      })
    ) {
      this._scheduleReconnect(guildId);
    }
  }

  _scheduleReconnect(guildId) {
    if (this.reconnectTimers.has(guildId)) return;
    const attempt = this.reconnectAttempts.get(guildId) ?? 0;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      this.logger?.warn?.({ guildId, attempt }, "watchvc giving up reconnect");
      return;
    }
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(guildId);
      const res = await this.reassert(guildId);
      if (res.ok) {
        this.reconnectAttempts.delete(guildId);
      } else {
        this.reconnectAttempts.set(guildId, attempt + 1);
        this._scheduleReconnect(guildId);
      }
    }, backoffMs(attempt));
    timer.unref?.();
    this.reconnectTimers.set(guildId, timer);
  }

  _clearReconnect(guildId) {
    clearTimeout(this.reconnectTimers.get(guildId));
    this.reconnectTimers.delete(guildId);
    this.reconnectAttempts.delete(guildId);
  }

  async _resolveChannel(channelId) {
    try {
      return await this.client.channels.fetch(channelId);
    } catch {
      return null;
    }
  }
}
