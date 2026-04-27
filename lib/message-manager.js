"use strict";

const { logger } = require("../logger");

/**
 * Per-chat ephemeral duration cache.
 * Populated from incoming messages so outgoing messages automatically
 * respect the chat's disappearing-message setting and never trigger
 * "The sender may be on an old version of WhatsApp."
 */
const ephemeralCache = new Map();

class MessageManager {
  constructor() {
    this.pending = new Map();
  }

  /**
   * Record a chat's disappearing-message duration (in seconds).
   * Call this whenever an incoming message reveals an ephemeral setting.
   * Pass 0 or falsy to clear the cache for that chat.
   */
  setEphemeral(jid, seconds) {
    if (!jid) return;
    if (seconds && seconds > 0) {
      ephemeralCache.set(jid, seconds);
    } else {
      ephemeralCache.delete(jid);
    }
  }

  /** Return the cached ephemeral duration for a chat, or 0. */
  getEphemeral(jid) {
    return ephemeralCache.get(jid) || 0;
  }

  /** Build the options object with ephemeralExpiration if the chat requires it. */
  _ephemeralOpts(jid, extra) {
    const dur = this.getEphemeral(jid);
    if (!dur) return extra || undefined;
    return { ...(extra || {}), ephemeralExpiration: dur };
  }

  async sendTemp(sock, jid, text, ms = 6000) {
    if (!sock || !jid || !text) return null;
    try {
      const sent = await sock.sendMessage(jid, { text }, this._ephemeralOpts(jid));
      if (!sent?.key) return sent;

      logger(`[MsgMgr] SentTemp: ${jid}`);

      this._cancelPending(jid);

      const timer = setTimeout(async () => {
        this.pending.delete(jid);
        try {
          await sock.sendMessage(jid, { delete: sent.key });
        } catch {}
      }, ms);
      timer.unref();

      this.pending.set(jid, { key: sent.key, timer });
      return sent;
    } catch (err) {
      if (!jid?.endsWith("@lid")) {
        logger(`[MsgMgr] sendTemp error to ${jid}: ${err.message}`);
      }
      return null;
    }
  }

  async send(sock, jid, content) {
    if (!sock || !jid || !content) return null;
    try {
      const sent = await sock.sendMessage(jid, content, this._ephemeralOpts(jid));
      if (sent)
        logger(`[MsgMgr] Sent: ${jid} (${Object.keys(content).join(", ")})`);

      return sent;
    } catch (err) {
      if (!err.message?.includes("403") && !jid?.endsWith("@lid")) {
        logger(`[MsgMgr] Send error to ${jid}: ${err.message}`);
      }
      return null;
    }
  }

  async react(sock, jid, msgKey, emoji) {
    if (!sock || !jid || !msgKey || !emoji) return;
    try {
      await sock.sendMessage(jid, { react: { text: emoji, key: msgKey } });
    } catch {}
  }

  async delete(sock, jid, msgKey) {
    if (!sock || !jid || !msgKey) return false;
    try {
      await sock.sendMessage(jid, { delete: msgKey });
      return true;
    } catch {
      return false;
    }
  }

  _cancelPending(jid) {
    const rec = this.pending.get(jid);
    if (rec?.timer) clearTimeout(rec.timer);
    this.pending.delete(jid);
  }

  cleanup() {
    for (const { timer } of this.pending.values()) {
      if (timer) clearTimeout(timer);
    }
    this.pending.clear();
    ephemeralCache.clear();
  }
}

module.exports = new MessageManager();
