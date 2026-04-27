'use strict';
/**
 * Multi-Session Manager
 * Each session lives in sessions/<id>/ with its own Baileys socket.
 * The main bot.js session (session/) is separate and untouched.
 */

const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const { BROWSER } = require('./config');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { normalizeOwner } = require('./lib/utils');

const VALID_WORK_MODES = new Set(['public', 'private', 'self']);

function metadataPath(id) {
    return path.join(__dirname, 'sessions', id, 'metadata.json');
}

function saveMetadata(id, entry) {
    try {
        const data = {
            owner: entry.owner,
            workMode: entry.workMode,
            autoStatus: entry.autoStatus,
            disabledModules: entry.disabledModules,
            botEnabled: entry.botEnabled !== false,
            name: entry.name || null,
            prefix: entry.prefix || null,
            number: entry.number,
            processedCount: entry.processedCount || 0,
            commandsCount: entry.commandsCount || 0,
            autoRead: entry.autoRead,
            autoTyping: entry.autoTyping,
            autoReactStatus: entry.autoReactStatus,
            nsfwEnabled: entry.nsfwEnabled,
            autoReply: entry.autoReply
        };
        fs.writeFileSync(metadataPath(id), JSON.stringify(data, null, 2));
    } catch (e) {
        logger(`[Session ${id}] Failed to save metadata: ${e.message}`);
    }
}

function sessionSnapshot(id, s) {
    return {
        id,
        label: id,
        isMain: false,
        number: s.number || null,
        name: s.name || null,
        prefix: s.prefix || null,
        status: s.status,
        startedAt: s.startedAt,
        platform: s.platform || null,
        qrAvailable: !!s.qrDataUrl && s.status !== 'Connected',
        pairCode: s.pairCode || null,
        pairCodeExpiresAt: s.pairCodeExpiresAt || null,
        qrPaused: !!s.qrPaused,
        phoneNumber: s.phoneNumber || null,
        owner: s.owner || null,
        workMode: s.workMode || 'public',
        autoStatus: s.autoStatus !== false,
        botEnabled: s.botEnabled !== false,
        disabledModules: Array.isArray(s.disabledModules) ? s.disabledModules : [],
        processedCount: s.processedCount || 0,
        commandsCount: s.commandsCount || 0,
        autoRead: s.autoRead,
        autoTyping: s.autoTyping,
        autoReactStatus: s.autoReactStatus,
        nsfwEnabled: s.nsfwEnabled,
        autoReply: s.autoReply,
    };
}

function emitSessionUpdate(id, patch = {}) {
    const entry = registry.get(id);
    emit('session:update', { ...(entry ? sessionSnapshot(id, entry) : { id }), ...patch });
}

function loadMetadata(id) {
    try {
        const p = metadataPath(id);
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
    } catch (e) {
        logger(`[Session ${id}] Failed to load metadata: ${e.message}`);
    }
    return {};
}
const { normalizeSriLankanPhoneNumber } = require('./lib/phone-normalizer');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// session registry: id → { sock, status, qr, pairCode, number, startedAt, phoneNumber }
const registry = new Map();
let _io = null;

function setIO(io) { _io = io; }

function emit(event, data) {
    if (_io) _io.emit(event, data);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionDir(id) {
    return path.join(SESSIONS_DIR, String(id));
}

function listSessionIds() {
    try {
        return fs.readdirSync(SESSIONS_DIR).filter(f => {
            return fs.statSync(path.join(SESSIONS_DIR, f)).isDirectory();
        });
    } catch { return []; }
}

function getAll() {
    return Array.from(registry.entries()).map(([id, s]) => sessionSnapshot(id, s));
}

function get(id) { return registry.get(id) || null; }

async function requestPairCodeInternal(id, cleaned, options = {}) {
    const {
        waitForSocket = true,
        retries = 4,
        retryDelayMs = 1500,
        socketWaitMs = 12000,
    } = options;

    const entry = registry.get(id);
    if (!entry) return { error: 'Session not found' };

    entry.pairMode = true;
    entry.phoneNumber = cleaned;
    entry.pairCode = null;
    entry.pairCodeExpiresAt = null;

    const waitUntil = Date.now() + socketWaitMs;
    while (waitForSocket && !entry.sock && Date.now() < waitUntil) {
        await delay(250);
    }

    if (!entry.sock) {
        return { error: 'Socket not ready yet. Please wait a moment and retry.' };
    }

    // Wait for the socket to have the requestPairingCode method available
    let methodReady = false;
    const methodCheckTimeout = Date.now() + 5000;
    while (!methodReady && Date.now() < methodCheckTimeout) {
        if (typeof entry.sock.requestPairingCode === 'function') {
            methodReady = true;
            break;
        }
        await delay(100);
    }

    // Check if requestPairingCode method exists
    if (!entry.sock || typeof entry.sock.requestPairingCode !== 'function') {
        return { error: 'Socket not fully initialized. Please wait and retry.' };
    }

    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const formattedPhone = cleaned;
            const code = await entry.sock.requestPairingCode(formattedPhone);
            entry.pairCode = code;
            entry.pairCodeExpiresAt = Date.now() + 60000;
            entry.status = 'Awaiting Pair Code';
            emit('session:paircode', { id, code, expiresAt: entry.pairCodeExpiresAt });
            emit('session:update', { id, pairCode: code, pairCodeExpiresAt: entry.pairCodeExpiresAt, status: entry.status });
            logger(`[Session ${id}] Pair code requested for ${formattedPhone}: ${code}`);
            return { ok: true, code, expiresAt: entry.pairCodeExpiresAt };
        } catch (error) {
            lastError = error;
            logger(`[Session ${id}] Pair code attempt ${attempt}/${retries} failed: ${error.message}`);
            if (attempt < retries) {
                await delay(retryDelayMs);
            }
        }
    }

    return { error: lastError?.message || 'Failed to generate pair code' };
}

// ── Create / start a session ───────────────────────────────────────────────
async function createSession(id, opts = {}) {
    if (registry.has(id)) {
        const existing = registry.get(id);
        if (existing.status === 'Connected') return { error: 'Session already connected' };
        await destroySocket(id, { logout: false });
    }

    const normalizedPhone = opts.pairMode && opts.phone
        ? normalizeSriLankanPhoneNumber(opts.phone)
        : null;
    if (opts.pairMode && (!normalizedPhone || !normalizedPhone.ok)) {
        return { error: normalizedPhone?.error || 'Invalid phone number' };
    }

    // If session already exists, stop the old one first to avoid conflicts
    if (registry.has(id)) {
        const oldEntry = registry.get(id);
        if (oldEntry.sock) {
            try { oldEntry.sock.ev.removeAllListeners('connection.update'); } catch { }
            try { oldEntry.sock.end(undefined); } catch { }
            oldEntry.sock = null;
        }
        registry.delete(id);
    }

    const dir = sessionDir(id);

    // For pair mode: always start fresh — stale creds cause "Couldn't link device"
    if (opts.pairMode && fs.existsSync(dir)) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const entry = {
        sock: null,
        status: 'Initializing',
        qr: null,
        qrDataUrl: null,
        pairCode: null,
        pairCodeExpiresAt: null,
        pairCodeRequested: false,
        number: null,
        startedAt: new Date().toISOString(),
        phoneNumber: normalizedPhone?.phone || null,
        name: null,
        pairMode: !!opts.pairMode,
        reconnectTimer: null,
        qrPaused: false,
        manualDisconnectKeep: false,
        // New management fields
        owner: normalizeOwner(opts.owner),
        workMode: 'public', // public or private
        autoStatus: true,
        botEnabled: true,
        disabledModules: [],
        processedCount: 0,
        commandsCount: 0,
        autoRead: null, // null means use global
        autoTyping: null,
        autoReactStatus: null,
        nsfwEnabled: null,
        isMain: false
    };
    registry.set(id, entry);
    emit('session:update', { id, status: 'Initializing' });

    await startSocket(id, entry);
    return { ok: true, id };
}

async function startSocket(id, entry) {
    try {
        const dir = sessionDir(id);
        const { state, saveCreds } = await useMultiFileAuthState(dir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            browser: ['Ubuntu', 'Chrome', String(id).slice(0, 10)],
            syncFullHistory: false,
            markOnlineOnConnect: true,
            printQRInTerminal: false,
        });

        entry.sock = sock;
        entry.status = 'Connecting';
        sock.startTime = Math.floor(Date.now() / 1000);
        emit('session:update', { id, status: 'Connecting' });

        // Auto-request pair code immediately if pairMode is set
        if (entry.pairMode && entry.phoneNumber && !state.creds.registered) {
            const normalized = normalizeSriLankanPhoneNumber(entry.phoneNumber);
            const cleaned = normalized.ok ? normalized.phone : '';
            setTimeout(async () => {
                try {
                    const currentEntry = registry.get(id);
                    if (!currentEntry || currentEntry.status === 'Connected') return;
                    await requestPairCodeInternal(id, cleaned, { waitForSocket: true });
                } catch (e) {
                    logger(`[Session ${id}] Pair code auto-request failed: ${e.message}`);
                    emit('session:update', { id, pairCodeError: e.message });
                }
            }, 5000);
        }

        entry.qrAttempts = entry.qrAttempts || 0;

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // Skip QR if in pair mode (pair code was already requested)
                if (entry.pairMode) return;
                entry.qrAttempts = (entry.qrAttempts || 0) + 1;
                try {
                    entry.qr = qr;
                    const dataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
                    entry.qrDataUrl = dataUrl;
                    entry.status = 'Awaiting QR Scan';
                    emit('session:qr', { id, qr: dataUrl });
                    emit('session:update', { id, status: 'Awaiting QR Scan', qr: dataUrl });
                    logger(`[Session ${id}] QR generated (${entry.qrAttempts}/5)`);
                } catch (e) { logger(`[Session ${id}] QR error: ${e.message}`); }
                // Throttle: stop generating after 5 unscanned QRs
                if (entry.qrAttempts >= 2) {
                    logger(`[Session ${id}] QR pause: too many unscanned codes. Click "Reconnect" to retry.`);
                    entry.qrPaused = true;
                    entry.status = 'Idle (Paused)';
                    emit('session:update', { id, status: 'Idle (Paused)' });
                    try { sock.ev.removeAllListeners('connection.update'); } catch { }
                    try { sock.end(undefined); } catch { }
                    return;
                }
            }

            if (connection === 'close') {
                const error = lastDisconnect?.error;
                const code = error?.output?.statusCode;
                const isBadMac = error?.message?.includes('Bad MAC') || error?.stack?.includes('verifyMAC');
                const loggedOut = code === DisconnectReason.loggedOut || code === 401 || isBadMac;

                if (isBadMac) {
                    logger(`[Session ${id}] ⚠️ Critical Session Corruption (Bad MAC) detected. Purging session for security.`);
                    try { fs.rmSync(sessionDir(id), { recursive: true, force: true }); } catch { }
                    registry.delete(id);
                    emit('session:removed', { id });
                    return;
                }

                entry.sock = null;
                entry.status = loggedOut ? 'Logged Out' : 'Disconnected';
                entry.qr = null;
                entry.qrDataUrl = null;
                entry.pairCode = null;
                entry.pairCodeExpiresAt = null;
                if (entry.reconnectTimer) {
                    clearTimeout(entry.reconnectTimer);
                    entry.reconnectTimer = null;
                }
                emit('session:update', { id, status: entry.status });
                logger(`[Session ${id}] Closed (code ${code})`);

                if (!loggedOut && !entry.qrPaused) {
                    // Auto-reconnect after 5 seconds
                    entry.reconnectTimer = setTimeout(() => {
                        if (registry.has(id) && !registry.get(id).qrPaused) {
                            logger(`[Session ${id}] Auto-reconnecting...`);
                            startSocket(id, registry.get(id)).catch(e => logger(`[Session ${id}] Reconnect error: ${e.message}`));
                        }
                    }, 5000);
                } else if (loggedOut) {
                    if (entry.manualDisconnectKeep) {
                        entry.manualDisconnectKeep = false;
                        entry.status = 'Logged Out';
                        entry.qrPaused = false;
                        entry.pairMode = false;
                        entry.phoneNumber = null;
                        emit('session:update', { id, status: entry.status });
                    } else {
                        // Remove session dir on logout
                        registry.delete(id);
                        try { fs.rmSync(sessionDir(id), { recursive: true, force: true }); } catch { }
                        emit('session:removed', { id });
                    }
                }
            }

            if (connection === 'open') {
                const num = sock.user?.id?.split(':')[0] || sock.user?.id || 'Unknown';
                entry.number = num;
                entry.name = sock.user?.name || null;
                entry.status = 'Connected';
                entry.qrAttempts = 0;
                entry.qrPaused = false;

                // Capture Device Metadata
                const device = sock.authState?.creds?.me?.platform || 'Unknown';
                const brand = sock.authState?.creds?.me?.deviceBrand || '';
                entry.platform = `${device}${brand ? ' (' + brand + ')' : ''}`;

                saveMetadata(id, entry);

                entry.qr = null;
                entry.qrDataUrl = null;
                entry.pairCode = null;
                emit('session:update', { id, status: 'Connected', number: num, platform: entry.platform });
                logger(`[Session ${id}] Connected as ${num} on ${entry.platform}`);

                // Sync groups for sub-session
                try {
                    const { syncGroups } = require('./bot');
                    if (syncGroups) await syncGroups(sock, id);
                } catch (e) {
                    logger(`[Session ${id}] Group sync failed: ${e.message}`);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            let handleMessages;
            try { handleMessages = require('./bot').handleMessages; } catch (e) { }
            if (handleMessages) await handleMessages(sock, m, id);
        });

    } catch (e) {
        logger(`[Session ${id}] Socket error: ${e.message}`);
        const entry = registry.get(id);
        if (entry) {
            entry.status = 'Error';
            emit('session:update', { id, status: 'Error', error: e.message });
        }
    }
}

// ── Request pair code ──────────────────────────────────────────────────────
// ── Request pair code internal logic ───────────────────────────────────────
async function requestPairCode(id, phoneNumber) {
    const entry = registry.get(id);
    if (!entry) return { error: 'Session not found' };
    if (entry.status === 'Connected') return { error: 'Already connected' };

    const normalized = normalizeSriLankanPhoneNumber(phoneNumber);
    if (!normalized.ok) {
        return { error: normalized.error };
    }

    return requestPairCodeInternal(id, normalized.phone);
}

// ── Remove / logout session ────────────────────────────────────────────────
async function destroySocket(id, options = {}) {
    const { logout = false } = options;
    const entry = registry.get(id);
    if (!entry) return;
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    if (entry.sock) {
        if (logout) {
            try { await entry.sock.logout(); } catch { }
        }
        try { entry.sock.end(undefined); } catch { }
    }
    entry.sock = null;
}

async function removeSession(id) {
    await destroySocket(id, { logout: true });
    registry.delete(id);
    try { fs.rmSync(sessionDir(id), { recursive: true, force: true }); } catch { }
    emit('session:removed', { id });
    logger(`[Session ${id}] Removed`);
    return { ok: true };
}

// ── Auto-restore sessions on startup ──────────────────────────────────────
async function autoRestore() {
    const ids = listSessionIds();
    logger(`Session Manager: restoring ${ids.length} session(s)...`);
    for (const id of ids) {
        const meta = loadMetadata(id);
        const entry = {
            sock: null,
            status: 'Restoring',
            qr: null,
            qrDataUrl: null,
            pairCode: null,
            number: meta.number || null,
            name: meta.name || null,
            startedAt: new Date().toISOString(),
            phoneNumber: null,
            reconnectTimer: null,
            qrPaused: false,
            manualDisconnectKeep: false,
            owner: normalizeOwner(meta.owner),
            workMode: meta.workMode || 'public',
            autoStatus: meta.autoStatus !== false,
            botEnabled: meta.botEnabled !== false,
            disabledModules: meta.disabledModules || [],
            processedCount: meta.processedCount || 0,
            commandsCount: meta.commandsCount || 0,
            autoRead: meta.autoRead !== undefined ? meta.autoRead : null,
            autoTyping: meta.autoTyping !== undefined ? meta.autoTyping : null,
            autoReactStatus: meta.autoReactStatus !== undefined ? meta.autoReactStatus : null,
            nsfwEnabled: meta.nsfwEnabled !== undefined ? meta.nsfwEnabled : null,
            isMain: false
        };
        registry.set(id, entry);
        await startSocket(id, entry).catch(e => logger(`[Session ${id}] Restore error: ${e.message}`));
        await new Promise(r => setTimeout(r, 500)); // stagger startup
    }
}

async function updateSessionSettings(id, settings) {
    const entry = registry.get(id);
    if (!entry) return { error: 'Session not found' };

    if (settings.workMode !== undefined) {
        const mode = String(settings.workMode).toLowerCase();
        if (!VALID_WORK_MODES.has(mode)) return { error: 'Invalid work mode' };
        entry.workMode = mode;
    }
    if (settings.autoStatus !== undefined) entry.autoStatus = !!settings.autoStatus;
    if (settings.botEnabled !== undefined) entry.botEnabled = !!settings.botEnabled;
    if (settings.name !== undefined) entry.name = typeof settings.name === 'string' ? settings.name.trim() : null;
    if (settings.prefix !== undefined) entry.prefix = typeof settings.prefix === 'string' ? settings.prefix.trim() : null;
    if (settings.disabledModules !== undefined) entry.disabledModules = Array.isArray(settings.disabledModules)
        ? settings.disabledModules.map((item) => String(item).toLowerCase()).filter(Boolean)
        : [];
    if (settings.owner !== undefined) entry.owner = require('./lib/utils').normalizeOwner(settings.owner);
    if (settings.autoRead !== undefined) entry.autoRead = settings.autoRead === null ? null : !!settings.autoRead;
    if (settings.autoTyping !== undefined) entry.autoTyping = settings.autoTyping === null ? null : !!settings.autoTyping;
    if (settings.autoReactStatus !== undefined) entry.autoReactStatus = settings.autoReactStatus === null ? null : !!settings.autoReactStatus;
    if (settings.nsfwEnabled !== undefined) entry.nsfwEnabled = settings.nsfwEnabled === null ? null : !!settings.nsfwEnabled;
    if (settings.autoReply !== undefined) entry.autoReply = settings.autoReply === null ? null : !!settings.autoReply;

    saveMetadata(id, entry);
    const session = sessionSnapshot(id, entry);
    emit('session:update', session);
    return { ok: true, session };
}

async function reconnectSession(id) {
    const entry = registry.get(id);
    if (!entry) return { error: 'Session not found' };
    if (entry.status === 'Connected') return { error: 'Already connected' };
    entry.qrAttempts = 0;
    entry.qrPaused = false;
    entry.status = 'Restarting';
    emit('session:update', { id, status: 'Restarting' });
    if (entry.reconnectTimer) { clearTimeout(entry.reconnectTimer); entry.reconnectTimer = null; }
    await destroySocket(id, { logout: false });
    await startSocket(id, entry);
    return { ok: true };
}

async function disconnectSession(id) {
    const entry = registry.get(id);
    if (!entry) return { error: 'Session not found' };

    entry.manualDisconnectKeep = true;
    entry.qrPaused = false;
    entry.qr = null;
    entry.qrDataUrl = null;
    entry.pairCode = null;
    entry.pairCodeExpiresAt = null;
    entry.pairMode = false;
    entry.phoneNumber = null;

    await destroySocket(id, { logout: true });

    try { fs.rmSync(sessionDir(id), { recursive: true, force: true }); } catch { }
    try { fs.mkdirSync(sessionDir(id), { recursive: true }); } catch { }

    entry.sock = null;
    entry.number = null;
    entry.platform = null;
    entry.status = 'Logged Out';
    emit('session:update', { id, status: entry.status });
    logger(`[Session ${id}] Disconnected and kept for relink.`);
    return { ok: true };
}

async function updateSessionMetrics(id, patch = {}) {
    const entry = registry.get(id);
    if (!entry) return;
    if (patch.processedCount !== undefined) entry.processedCount = patch.processedCount;
    if (patch.commandsCount !== undefined) entry.commandsCount = patch.commandsCount;
    saveMetadata(id, entry);
    emitSessionUpdate(id);
}

module.exports = {
    setIO,
    createSession,
    removeSession,
    disconnectSession,
    requestPairCode,
    reconnectSession,
    updateSessionSettings,
    updateSessionMetrics,
    getAll,
    get,
    autoRestore,
    SESSIONS_DIR,
};
