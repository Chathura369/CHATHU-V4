"use strict";

const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const db = require("./db");

// Directory where media will be saved
const VIEWONCE_DIR = path.join(process.cwd(), "public", "viewonce");

// Ensure the directory exists
if (!fs.existsSync(VIEWONCE_DIR)) {
    fs.mkdirSync(VIEWONCE_DIR, { recursive: true });
}

/**
 * Detects if a message is a strict View Once message.
 * @param {Object} message - The WhatsApp message object
 * @returns {Object|null} - Returns the media object and type if it's View Once, else null
 */
function isViewOnce(message) {
    if (!message || typeof message !== "object") return null;

    const mediaTypes = ["imageMessage", "videoMessage", "audioMessage", "documentMessage"];

    // 1. Check direct media types in this level
    for (const type of mediaTypes) {
        const media = message[type];
        if (media && (media.viewOnce === true || media.viewOnce === 1)) {
            return { media, type };
        }
    }

    // 2. Recursive search into wrappers (viewOnceMessage, ephemeralMessage, etc.)
    for (const key in message) {
        if (message[key] && typeof message[key] === "object") {
            // If it's a known wrapper or just any object with a 'message' property
            const subMsg = message[key].message || message[key];
            if (subMsg && subMsg !== message) {
                const found = isViewOnce(subMsg);
                if (found) return found;
            }
        }
    }

    return null;
}

/**
 * Gets the file extension based on mimetype.
 * @param {string} mimetype - The mimetype of the media
 * @returns {string}
 */
function getExtension(mimetype) {
    const types = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "audio/ogg": "ogg",
        "audio/mpeg": "mp3",
    };
    return types[mimetype] || "bin";
}

/**
 * Main capture function for View Once media.
 * @param {Object} sock - The Baileys socket instance
 * @param {Object} msg - The full message update object
 */
async function captureViewOnce(sock, msg, context = {}) {
    try {
        const sessionId = context.sessionId || "__main__";
        
        // If you want a global toggle, check it here:
        // if (!isAntiViewOnceEnabled(sessionId)) return;

        const messageContent = msg.message;
        if (!messageContent || msg.key?.fromMe) return;

        const viewOnceData = isViewOnce(messageContent);
        
        // Diagnostic log for media messages
        const hasMedia = messageContent.imageMessage || messageContent.videoMessage || 
                         messageContent.viewOnceMessage || messageContent.viewOnceMessageV2 ||
                         messageContent.ephemeralMessage;
                         
        if (hasMedia) {
            console.log(`[ViewOnce] 🔍 Checking incoming media... (IsViewOnce: ${!!viewOnceData})`);
            if (!viewOnceData) {
                console.log("[ViewOnce] DEBUG: Full Message Structure:");
                console.log(JSON.stringify(messageContent, null, 2));
            }
        }

        if (!viewOnceData) return;

        const { media, type } = viewOnceData;
        console.log(`[ViewOnce] ✅ Detected ${type} from ${msg.pushName || msg.key.remoteJid}`);

        // Prepare a message structure that downloadMediaMessage understands
        const downloadMsg = {
            key: msg.key,
            message: { [type]: media }
        };

        // Download the buffer
        const buffer = await downloadMediaMessage(
            downloadMsg,
            "buffer",
            {},
            {
                logger: {
                    info: () => {},
                    error: (m) => console.error(`[ViewOnce] Download Error: ${m}`),
                    warn: (m) => console.warn(`[ViewOnce] Download Warning: ${m}`),
                    debug: () => {},
                    trace: () => {},
                },
            }
        );

        if (!buffer || buffer.length === 0) {
            console.error("[ViewOnce] Download failed: Buffer is empty");
            return;
        }

        // Generate filename: timestamp + sender name
        const timestamp = Date.now();
        const sender = (msg.pushName || msg.key.participant || msg.key.remoteJid || "unknown").split("@")[0].replace(/[^\w]/g, "_");
        const extension = getExtension(media.mimetype);
        const filename = `${timestamp}_${sender}.${extension}`;
        const filePath = path.join(VIEWONCE_DIR, filename);

        // Save to public/viewonce folder
        fs.writeFileSync(filePath, buffer);
        console.log(`[ViewOnce] Saved: ${filename}`);

        // Handle auto-forwarding if enabled
        if (isAntiViewOnceForwardEnabled(sessionId)) {
            const myId = sock?.user?.id?.split(":")[0] + "@s.whatsapp.net";
            if (myId) {
                await sock.sendMessage(myId, { forward: downloadMsg }, { quoted: msg }).catch(() => {});
            }
        }

    } catch (error) {
        console.error(`[ViewOnce] Error: ${error.message}`);
    }
}

// --- Compatibility Functions for Commands ---

function isAntiViewOnceEnabled(sessionId = "__main__") {
    if (sessionId === "__main__") return db.getSetting("anti_view_once") !== false;
    // For sub-sessions, could check session-manager logic, but defaulting to main db for now
    return db.getSetting("anti_view_once") !== false;
}

async function setAntiViewOnceEnabled(sessionId, enabled) {
    db.setSetting("anti_view_once", !!enabled);
    return { status: true };
}

function isAntiViewOnceForwardEnabled(sessionId = "__main__") {
    return db.getSetting("anti_view_once_forward") === true;
}

async function setAntiViewOnceForward(sessionId, enabled) {
    db.setSetting("anti_view_once_forward", !!enabled);
    return { status: true };
}

function getAntiDeleteConfig(sessionId = "__main__") {
    // This is often handled in bot.js, but provided here for command compatibility
    const val = db.getSetting("antiDelete") || { enabled: false, target: "chat" };
    return typeof val === "object" ? val : { enabled: !!val, target: "chat" };
}

module.exports = {
    captureViewOnce,
    isAntiViewOnceEnabled,
    setAntiViewOnceEnabled,
    isAntiViewOnceForwardEnabled,
    setAntiViewOnceForward,
    getAntiDeleteConfig
};