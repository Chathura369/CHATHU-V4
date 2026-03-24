'use strict';

const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const { logger } = require('./logger');
const { loadCommands, handleCommand } = require('./lib/handler');
const { BROWSER, SESSION_DIR, AUTO_READ, AUTO_TYPING, PREFIX } = require('./config');
const appState = require('./state');
const db = require('./lib/db');

const BAD_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'pussy', 'whore', 'nigger'];

const messageStore = [];
let lastConnectTime = Math.floor(Date.now() / 1000);
function cacheMsg(msg) {
    messageStore.push(msg);
    if (messageStore.length > 100) messageStore.shift();
}
function getCachedMsg(jid, id) {
    return messageStore.find(m => m.key.remoteJid === jid && m.key.id === id);
}

function getIO() {
    try { return require('./dashboard').io; } catch { return null; }
}

async function startBot() {
    loadCommands();
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    logger(`Starting CHATHU MD (Baileys v${version.join('.')})`);
    appState.setStatus('Connecting');
    const io = getIO();
    if (io) io.emit('update', { status: 'Connecting' });

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        browser: BROWSER,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        getMessage: async (key) => {
            const msg = getCachedMsg(key.remoteJid, key.id);
            return msg?.message || undefined;
        }
    });

    // Store socket in shared state for API access
    appState.setSocket(sock);

    sock.ev.on('connection.update', async (update) => {
        try {
            const { connection, lastDisconnect, qr } = update;
            const io = getIO();

            if (qr) {
                try {
                    const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
                    appState.setMainQr(qrDataUrl);
                    if (io) io.emit('qr', qrDataUrl);
                    logger('[Main Bot] QR code generated. Scan with WhatsApp.');
                } catch (err) { logger(`QR Error: ${err.message}`); }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.message || 'Unknown';
                
                // Specific handling for common DisconnectReasons
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    logger(`❌ [Main Bot] Logged Out (401). Clearing session and forcing re-scan...`);
                    appState.setStatus('Logged Out');
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        if (fs.existsSync(SESSION_DIR)) {
                            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                            fs.mkdirSync(SESSION_DIR, { recursive: true });
                        }
                    } catch (err) { logger(`Session Clear Error: ${err.message}`); }
                    setTimeout(() => startBot(), 3000);
                } else if (statusCode === 440) {
                    logger('⚠️ [Main Bot] Session Replaced (440). Another instance may be running.');
                    appState.setStatus('Session Replaced');
                } else {
                    logger(`[Main Bot] Connection closed (${statusCode}): ${reason}. Reconnecting...`);
                    appState.setStatus('Disconnected');
                }

                appState.setSocket(null);
                appState.setNumber(null);
                if (io) io.emit('update', { status: 'Reconnecting...' });
                
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
                if (shouldReconnect) setTimeout(() => startBot(), 5000);
            } else if (connection === 'open') {
                logger('✅ [Main Bot] Connected!');
                appState.setStatus('Connected');
                appState.setConnectedAt(new Date().toISOString());
                sock.startTime = Math.floor(Date.now() / 1000);
                appState.setMainQr(null);
                appState.setMainPairCode(null);
                const num = sock.user?.id?.split(':')[0] || sock.user?.id || 'Unknown';
                appState.setNumber(num);
                if (io) io.emit('update', { status: 'Connected', number: num });

                // Sync Groups to DB for Dashboard
                const db = require('./lib/db');
                try {
                    if (sock.groupFetchAllFull) {
                        const groups = await sock.groupFetchAllFull();
                        Object.entries(groups).forEach(([jid, metadata]) => {
                            db.update('groups', jid, {
                                name: metadata.subject,
                                memberCount: metadata.participants?.length || 0,
                                sessionId: 'main'
                            });
                        });
                        logger(`Synced ${Object.keys(groups).length} groups to Dashboard.`);
                    }
                } catch (e) { logger(`Group Sync Error: ${e.message}`); }
            }
        } catch (e) {
            logger(`Connection Update Error: ${e.message}`);
        }
    });

    // Handle unexpected socket errors to prevent crash
    sock.ev.on('error', (err) => {
        logger(`Socket Error: ${err.message}`);
        if (err.message.includes('Connection Closed') || err.message.includes('Precondition Required')) {
            // This is handled by connection.update 'close', but catching here prevents throw
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        await handleMessages(sock, m);
    });

    return sock;
}

const spamMap = new Map();

async function handleMessages(sock, m) {
    if (m.type !== 'notify') return;
    const db = require('./lib/db');
    
    for (const msg of m.messages) {
        if (!msg.message) continue;
        const jid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const pushName = msg.pushName || 'User';
        const isGroup = jid.endsWith('@g.us');

        // Update User in DB
        if (!fromMe && jid.endsWith('@s.whatsapp.net')) {
            db.update('users', jid, { 
                lastSeen: new Date().toISOString(),
                pushName: pushName,
                number: jid.split('@')[0]
            });
        }

        // Group Protections
        if (isGroup && !fromMe) {
            const group = db.get('groups', jid);
            if (group) {
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                
                // Anti-Link
                if (group.antiLink && (text.includes('chat.whatsapp.com') || text.includes('http://') || text.includes('https://'))) {
                    logger(`Anti-Link: Deleting link from ${pushName} in ${group.name}`);
                    await sock.sendMessage(jid, { delete: msg.key });
                    continue;
                }

                // Anti-Spam (detects 3+ messages in 5s)
                if (group.antiSpam) {
                    const now = Date.now();
                    const userSpam = spamMap.get(msg.key.participant || jid) || [];
                    const recent = userSpam.filter(t => now - t < 5000);
                    recent.push(now);
                    spamMap.set(msg.key.participant || jid, recent);
                    if (recent.length > 4) {
                        logger(`Anti-Spam: Skipping message from ${pushName} in ${group.name}`);
                        continue;
                    }
                }

                // Mute Check (If muted, we don't process commands further down)
                if (group.isMuted) {
                    const prefix = db.getSetting('prefix') || '.';
                    if (text.startsWith(prefix)) {
                        logger(`Mute: Ignoring command in ${group.name}`);
                        continue;
                    }
                }
            }
        }
    }
    if (appState.isRestartRequested()) {
        appState.clearRestart();
        logger('Admin restart requested — reconnecting...');
        try { await sock.logout(); } catch {}
        setTimeout(() => startBot(), 2000);
        return;
    }

    for (const msg of m.messages) {
        if (!msg.message) continue;

        // Skip messages older than current connection (Anti-Spam)
        const msgTime = msg.messageTimestamp || msg.message?.messageTimestamp || 0;
        if (sock.startTime && msgTime < sock.startTime) continue;

        const from = msg.key.remoteJid;

        if (from === 'status@broadcast') {
            if (AUTO_READ) await sock.readMessages([msg.key]).catch(() => {});
            continue;
        }

        const text = msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption || '';

        if (msg.key.fromMe && !text.startsWith(PREFIX)) continue;

        const sender = msg.key.participant || msg.key.remoteJid;

        const bannedList = db.get('settings', 'banned') || {};
        if (bannedList[sender]) continue;

        cacheMsg(msg);

        // Group moderation
        if (from.endsWith('@g.us') && text) {
            const groupSettings = db.get('groups', from);

            if (groupSettings.antilink && /(https?:\/\/|chat\.whatsapp\.com)/i.test(text)) {
                try {
                    const meta = await sock.groupMetadata(from);
                    const isAdmin = meta.participants.find(p => p.id === sender)?.admin;
                    if (!isAdmin) {
                        await sock.sendMessage(from, { delete: msg.key });
                        await sock.groupParticipantsUpdate(from, [sender], 'remove');
                        continue;
                    }
                } catch {}
            }

            if (groupSettings.antibad && BAD_WORDS.some(w => text.toLowerCase().includes(w))) {
                try {
                    const meta = await sock.groupMetadata(from);
                    const isAdmin = meta.participants.find(p => p.id === sender)?.admin;
                    if (!isAdmin) {
                        await sock.sendMessage(from, { delete: msg.key });
                        await sock.sendMessage(from, {
                            text: `⚠️ @${sender.split('@')[0]}, watch your language! This group does not allow bad words.`,
                            mentions: [sender]
                        });
                        continue;
                    }
                } catch {}
            }
        }

        if (AUTO_READ && text.startsWith(PREFIX)) await sock.readMessages([msg.key]).catch(() => {});
        if (AUTO_TYPING && text.startsWith(PREFIX)) await sock.sendPresenceUpdate('composing', from).catch(() => {});

        const isCommand = await handleCommand(sock, msg, from, text);

        if (!isCommand && !msg.key.fromMe) {
            const lower = text.toLowerCase().trim();
            if (lower === 'hi' || lower === 'hello' || lower === 'hey') {
                await sock.sendMessage(from, {
                    text: `Hello! 👋 Welcome, Master!\n\nType *${PREFIX}menu* to see all my features or *${PREFIX}help* for a quick guide. 🚀\n\n- Powered by *CHATHU MD*`
                });
            }
        }
    }
}

module.exports = { startBot, handleMessages };
