"use strict";

const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const db = require("./db");

const VIEWONCE_DIR = path.join(process.cwd(), "public", "viewonce");

// Ensure save directory exists on load
if (!fs.existsSync(VIEWONCE_DIR)) {
    fs.mkdirSync(VIEWONCE_DIR, { recursive: true });
}

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
        if (media && media.viewOnce === true) {
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
 * Capture and save View Once media to disk.
 * Save-only: does NOT forward to inbox.
 *
 * @param {Object} sock  - Baileys socket instance
 * @param {Object} msg   - Raw message object from messages.upsert
 * @param {Object} [context] - Optional { sessionId }
 */
async function captureViewOnce(sock, msg, context = {}) {
    try {
        const content = msg.message;
        if (!content || msg.key?.fromMe) return;

        const viewOnceData = isViewOnce(content);
        if (!viewOnceData) return;

        const { media, type } = viewOnceData;
        const sender = (
            msg.pushName ||
            msg.key.participant ||
            msg.key.remoteJid ||
            "unknown"
        )
            .split("@")[0]
            .replace(/[^\w]/g, "_");

        console.log(
            `[ViewOnce] Detected ${type} from ${sender}`
        );

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

        const timestamp = Date.now();
        const ext = getExtension(media.mimetype);
        const filename = `${timestamp}_${sender}.${ext}`;
        const filePath = path.join(VIEWONCE_DIR, filename);

        fs.writeFileSync(filePath, buffer);
        console.log(`[ViewOnce] Saved: ${filename} (${buffer.length} bytes)`);
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
