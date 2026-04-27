"use strict";

const msgMgr = require("./message-manager");

/**
 * Inspect an incoming message and cache the chat's ephemeral duration
 * so all future outgoing messages to that chat include the correct
 * ephemeralExpiration. This prevents the "old version of WhatsApp" warning.
 */
function learnEphemeral(msg) {
  if (!msg?.key?.remoteJid) return;
  const jid = msg.key.remoteJid;
  const raw = msg.message;
  if (!raw) return;

  // Ephemeral messages arrive wrapped in an ephemeralMessage container
  // that carries the expiration value.
  const eph = raw.ephemeralMessage;
  if (eph) {
    // The wrapper itself has .message (inner) but the expiration comes
    // from the outer message's messageContextInfo or from Baileys'
    // normalized ephemeralExpiration field on the WebMessageInfo.
    const duration =
      msg.ephemeralExpiration ||                       // Baileys v6 normalized
      eph.message?.messageContextInfo?.expiration ||   // inside the container
      0;
    if (duration > 0) {
      msgMgr.setEphemeral(jid, duration);
      return;
    }
  }

  // Some Baileys versions expose it at the top level
  if (msg.ephemeralExpiration && msg.ephemeralExpiration > 0) {
    msgMgr.setEphemeral(jid, msg.ephemeralExpiration);
  }
}

/**
 * Wrap sock.sendMessage so it automatically includes ephemeralExpiration
 * for chats that have disappearing messages enabled.
 * Use this for direct sock.sendMessage calls that bypass MessageManager.
 */
function sendWithEphemeral(sock, jid, content, opts) {
  const dur = msgMgr.getEphemeral(jid);
  if (dur > 0) {
    opts = { ...(opts || {}), ephemeralExpiration: dur };
  }
  return sock.sendMessage(jid, content, opts);
}

module.exports = { learnEphemeral, sendWithEphemeral };
