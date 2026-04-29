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

/**
 * Detects if a message is strictly View Once.
 * Walks through wrapper layers (viewOnceMessage, ephemeralMessage, etc.)
 * and only matches when viewOnce === true on the inner media object.
 */
function isViewOnce(message) {
    if (!message || typeof message !== "object") return null;

    for (const type of MEDIA_TYPES) {
        const media = message[type];
        if (media && (media.viewOnce === true || media.viewOnce === 1)) {
            return { media, type };
        }
    }

    // Recurse into wrapper objects (viewOnceMessage, viewOnceMessageV2, etc.)
    for (const key of Object.keys(message)) {
        const child = message[key];
        if (child && typeof child === "object") {
            const inner = child.message || child;
            if (inner !== message) {
                const found = isViewOnce(inner);
                if (found) return found;
            }
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
        const content = msg.message;
        if (!content || msg.key?.fromMe) return;

        const viewOnceData = isViewOnce(content);
        if (!viewOnceData) return;

        const { media, type } = viewOnceData;
        const senderName = msg.pushName || "Unknown";
        const senderJid = msg.key.participant || msg.key.remoteJid || "unknown";
        const senderShort = senderJid.split("@")[0];

        console.log(`[ViewOnce] Detected ${type} from ${senderName} (${senderShort})`);

        // Build a structure that downloadMediaMessage expects
        const downloadMsg = { key: msg.key, message: { [type]: media } };

        const buffer = await downloadMediaMessage(
            downloadMsg,
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
    return db.getSetting("anti_view_once") !== false;
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
