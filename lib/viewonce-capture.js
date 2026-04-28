"use strict";

const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const config = require("../config");
const db = require("./db");
const appState = require("../state");
const { logger } = require("../logger");
const { normalizeOwner } = require("./utils");

const MEDIA_TYPES = [
  { key: "imageMessage", sendKey: "image", extension: "jpg" },
  { key: "videoMessage", sendKey: "video", extension: "mp4" },
  { key: "audioMessage", sendKey: "audio", extension: "ogg" },
  { key: "documentMessage", sendKey: "document", extension: "bin" },
];

function isAntiViewOnceEnabled(sessionId = "__main__") {
  if (sessionId === "__main__") {
    const overrides = db.getSetting("main_bot_settings") || {};
    if (overrides.antiViewOnce !== undefined) return overrides.antiViewOnce === true;
    return appState.getAntiViewOnceEnabled() === true;
  }

  try {
    const session = require("../session-manager").get(sessionId);
    return session?.antiViewOnce === true;
  } catch {
    return false;
  }
}

function setAntiViewOnceEnabled(sessionId = "__main__", enabled) {
  if (sessionId === "__main__") {
    appState.setAntiViewOnceEnabled(enabled);
    const overrides = db.getSetting("main_bot_settings") || {};
    overrides.antiViewOnce = !!enabled;
    db.setSetting("main_bot_settings", overrides);
    db.flush();
    return { ok: true };
  }

  return require("../session-manager").updateSessionSettings(sessionId, {
    antiViewOnce: !!enabled,
  });
}

function unwrapViewOnceMessage(message = {}) {
  const root = message?.message || message || {};
  const edited = root.protocolMessage?.editedMessage;
  const wrappers = [
    root.viewOnceMessage?.message,
    root.viewOnceMessageV2?.message,
    root.viewOnceMessageV2Extension?.message,
    root.ephemeralMessage?.message?.viewOnceMessage?.message,
    root.ephemeralMessage?.message?.viewOnceMessageV2?.message,
    root.ephemeralMessage?.message?.viewOnceMessageV2Extension?.message,
    edited?.viewOnceMessage?.message,
    edited?.viewOnceMessageV2?.message,
    edited?.viewOnceMessageV2Extension?.message,
  ];
  return wrappers.find(Boolean) || null;
}

function getViewOnceMedia(message = {}) {
  const inner = unwrapViewOnceMessage(message);
  const direct = message?.message || message || {};
  const candidates = inner ? [inner, direct] : [direct];

  for (const candidate of candidates) {
    for (const type of MEDIA_TYPES) {
      const media = candidate[type.key];
      if (media && (candidate === inner || media.viewOnce === true)) {
        return { ...type, media, inner: candidate };
      }
    }
  }

  return null;
}

function buildDownloadMessage(msg, mediaInfo) {
  return {
    key: msg.key,
    message: {
      [mediaInfo.key]: mediaInfo.media,
    },
  };
}

function hasViewOnceMedia(message = {}) {
  return !!getViewOnceMedia(message);
}

function safeFileToken(value, fallback) {
  const token = String(value || "")
    .replace(/@.+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
  return token || fallback;
}

function extensionFromMime(mimetype, fallback) {
  const clean = String(mimetype || "").split(";")[0].trim().toLowerCase();
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
  };
  if (map[clean]) return map[clean];
  const subtype = clean.split("/")[1];
  return subtype ? subtype.replace(/[^a-z0-9]/g, "").slice(0, 8) : fallback;
}

function ensureStorage() {
  fs.mkdirSync(config.VIEWONCE_DIR, { recursive: true });
  const logDir = path.dirname(config.VIEWONCE_LOG_PATH);
  fs.mkdirSync(logDir, { recursive: true });
}

function readLog() {
  try {
    if (!fs.existsSync(config.VIEWONCE_LOG_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(config.VIEWONCE_LOG_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendLog(entry) {
  const entries = readLog();
  entries.push(entry);
  fs.writeFileSync(config.VIEWONCE_LOG_PATH, JSON.stringify(entries.slice(-1000), null, 2));
}

function getOwnerInboxJid(sessionId, owner) {
  const direct = normalizeOwner(owner);
  if (direct) return direct;

  if (sessionId === "__main__") {
    return normalizeOwner((db.getSetting("main_bot_settings") || {}).owner)
      || normalizeOwner(appState.getOwner())
      || normalizeOwner(config.OWNER_NUMBER);
  }

  try {
    const session = require("../session-manager").get(sessionId);
    return normalizeOwner(session?.owner) || normalizeOwner(config.OWNER_NUMBER);
  } catch {
    return normalizeOwner(config.OWNER_NUMBER);
  }
}

function buildForwardContent(mediaInfo, filePath, entry) {
  const caption = [
    "🚫 *View Once Captured*",
    `From: ${entry.sender}`,
    `Chat: ${entry.chat}`,
    `Type: ${entry.mediaType}`,
    `Saved: ${entry.fileName}`,
  ].join("\n");

  if (mediaInfo.sendKey === "image") {
    return {
      image: { url: filePath },
      caption,
      mimetype: mediaInfo.media.mimetype,
    };
  }
  if (mediaInfo.sendKey === "video") {
    return {
      video: { url: filePath },
      caption,
      mimetype: mediaInfo.media.mimetype,
    };
  }
  if (mediaInfo.sendKey === "audio") {
    return {
      audio: { url: filePath },
      mimetype: mediaInfo.media.mimetype || "audio/ogg",
      ptt: !!mediaInfo.media.ptt,
    };
  }
  return {
    document: { url: filePath },
    mimetype: mediaInfo.media.mimetype || "application/octet-stream",
    fileName: mediaInfo.media.fileName || entry.fileName,
    caption,
  };
}

async function captureViewOnce(sock, msg, options = {}) {
  if (!sock || !msg?.message || msg.key?.fromMe) return null;
  const sessionId = options.sessionId || "__main__";
  if (!isAntiViewOnceEnabled(sessionId)) return null;

  const mediaInfo = getViewOnceMedia(msg.message);
  if (!mediaInfo) return null;

  ensureStorage();

  const sender = msg.key?.participant || msg.key?.remoteJid || "unknown";
  const chat = msg.key?.remoteJid || "unknown";
  const mimetype = mediaInfo.media.mimetype || "application/octet-stream";
  const extension = extensionFromMime(mimetype, mediaInfo.extension);
  const fileName = [
    "viewonce",
    safeFileToken(sessionId, "main"),
    safeFileToken(sender, "sender"),
    Date.now(),
    safeFileToken(msg.key?.id, "message"),
  ].join("-") + `.${extension}`;
  const filePath = path.join(config.VIEWONCE_DIR, fileName);

  const buffer = await downloadMediaMessage(buildDownloadMessage(msg, mediaInfo), "buffer", {}, {
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      trace: () => {},
    },
  });

  fs.writeFileSync(filePath, buffer);

  const entry = {
    id: msg.key?.id || null,
    sessionId,
    chat,
    sender,
    pushName: msg.pushName || null,
    mediaType: mediaInfo.key.replace("Message", ""),
    mimetype,
    caption: mediaInfo.media.caption || "",
    fileName,
    filePath,
    size: buffer.length,
    timestamp: new Date().toISOString(),
  };
  appendLog(entry);

  const ownerInbox = getOwnerInboxJid(sessionId, options.owner);
  if (ownerInbox) {
    await sock.sendMessage(ownerInbox, buildForwardContent(mediaInfo, filePath, entry)).catch((error) => {
      logger(`[ViewOnce] Forward failed (${sessionId}): ${error.message}`);
    });
  }

  logger(`[ViewOnce] Captured ${entry.mediaType} from ${sender} -> ${filePath}`);
  return entry;
}

module.exports = {
  captureViewOnce,
  getOwnerInboxJid,
  getViewOnceMedia,
  hasViewOnceMedia,
  isAntiViewOnceEnabled,
  setAntiViewOnceEnabled,
  unwrapViewOnceMessage,
};
