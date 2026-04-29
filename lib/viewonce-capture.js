"use strict";

const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const db = require("./db");

// Media types that can carry viewOnce
const MEDIA_TYPES = [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
];

// Wrapper keys that indicate a view-once message in the WhatsApp protobuf
const VIEW_ONCE_WRAPPERS = [
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
];

/**
 * Detects if a message is View Once.
 * Handles both V1 (viewOnce flag on media) and V2 (wrapper-based detection).
 */
function isViewOnce(message) {
    if (!message || typeof message !== "object") return null;

    // 1. Check for viewOnce wrapper keys — the wrapper itself means view once
    for (const wrapperKey of VIEW_ONCE_WRAPPERS) {
        const wrapper = message[wrapperKey];
        if (wrapper && typeof wrapper === "object") {
            const inner = wrapper.message || wrapper;
            // Extract the first media type from the inner message
            const found = findMedia(inner);
            if (found) return found;
        }
    }

    // 2. Unwrap ephemeralMessage and recurse
    if (message.ephemeralMessage?.message) {
        const found = isViewOnce(message.ephemeralMessage.message);
        if (found) return found;
    }

    // 3. Direct media with viewOnce flag (V1 / protobuf integer compat)
    for (const type of MEDIA_TYPES) {
        const media = message[type];
        if (media && (media.viewOnce === true || media.viewOnce === 1)) {
            return { media, type };
        }
    }

    return null;
}

/** Extract the first recognised media object from a message. */
function findMedia(message) {
    if (!message || typeof message !== "object") return null;
    for (const type of MEDIA_TYPES) {
        const media = message[type];
        if (media && typeof media === "object") {
            return { media, type };
        }
    }
    return null;
}

/** Map common mimetypes to file extensions. */
function getExtension(mimetype) {
    const map = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "audio/ogg": "ogg",
        "audio/mpeg": "mp3",
    };
    return map[mimetype] || "bin";
}

/**
 * Capture View Once media and forward it to the owner's WhatsApp number.
 *
 * @param {Object} sock  - Baileys socket instance
 * @param {Object} msg   - Raw message object from messages.upsert
 * @param {Object} [context] - Optional { sessionId, owner }
 */
async function captureViewOnce(sock, msg, context = {}) {
    try {
        const sessionId = context.sessionId || "__main__";
        if (!isAntiViewOnceEnabled(sessionId)) return;

        const content = msg.message;
        if (!content || msg.key?.fromMe) return;

        const viewOnceData = isViewOnce(content);
        if (!viewOnceData) return;

        const { media, type } = viewOnceData;
        const senderName = msg.pushName || "Unknown";
        const senderJid = msg.key.participant || msg.key.remoteJid || "unknown";
        const senderShort = senderJid.split("@")[0];

        console.log(`[ViewOnce] Detected ${type} from ${senderName} (${senderShort})`);

        // Pass the original message to downloadMediaMessage so Baileys can
        // use its own normalizeMessageContent / extractMessageContent to
        // locate the media stream correctly (handles V1, V2, ephemeral, etc.)
        const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            {
                logger: {
                    info: () => {},
                    error: (m) => console.error(`[ViewOnce] Download error: ${m}`),
                    warn: (m) => console.warn(`[ViewOnce] Download warning: ${m}`),
                    debug: () => {},
                    trace: () => {},
                },
            }
        );

        if (!buffer || buffer.length === 0) {
            console.error("[ViewOnce] Download failed: empty buffer");
            return;
        }

        // Determine owner JID to send to
        let ownerJid = context.owner;
        if (!ownerJid) {
            const { OWNER_NUMBER } = require("../config");
            ownerJid = OWNER_NUMBER;
        }
        if (!ownerJid) {
            console.error("[ViewOnce] No owner number configured, cannot forward");
            return;
        }

        // Normalize to JID format
        if (!ownerJid.includes("@")) {
            ownerJid = ownerJid + "@s.whatsapp.net";
        }

        // Determine media key for sendMessage
        const mediaKey = type === "imageMessage" ? "image"
            : type === "videoMessage" ? "video"
            : type === "audioMessage" ? "audio"
            : "document";

        const caption = `📸 *View Once Captured*\n👤 From: ${senderName} (${senderShort})\n🕐 ${new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" })}`;

        const sendPayload = { [mediaKey]: buffer, caption, mimetype: media.mimetype };
        if (mediaKey === "audio") delete sendPayload.caption;
        if (mediaKey === "document") {
            sendPayload.fileName = `viewonce_${Date.now()}.${getExtension(media.mimetype)}`;
        }

        await sock.sendMessage(ownerJid, sendPayload);
        console.log(`[ViewOnce] Forwarded ${type} from ${senderName} to owner (${ownerJid})`);
    } catch (error) {
        console.error(`[ViewOnce] Error: ${error.message}`);
    }
}

// --- Toggle helpers (used by commands & dashboard) ---

function isAntiViewOnceEnabled(sessionId = "__main__") {
    return db.getSetting("anti_view_once") === true;
}

async function setAntiViewOnceEnabled(_sessionId, enabled) {
    db.setSetting("anti_view_once", !!enabled);
    return { status: true };
}

function isAntiViewOnceForwardEnabled(_sessionId = "__main__") {
    // Forwarding removed; always returns false
    return false;
}

async function setAntiViewOnceForward(_sessionId, _enabled) {
    // No-op: forwarding is disabled (save-only mode)
    return { status: true };
}

function getAntiDeleteConfig(_sessionId = "__main__") {
    const val = db.getSetting("antiDelete") || { enabled: false, target: "chat" };
    return typeof val === "object" ? val : { enabled: !!val, target: "chat" };
}

module.exports = {
    captureViewOnce,
    isAntiViewOnceEnabled,
    setAntiViewOnceEnabled,
    isAntiViewOnceForwardEnabled,
    setAntiViewOnceForward,
    getAntiDeleteConfig,
};
