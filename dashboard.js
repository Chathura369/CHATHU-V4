'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const jwt = require('jsonwebtoken');
const { PORT, ADMIN_USER, ADMIN_PASS, JWT_SECRET, DOWNLOAD_DIR } = require('./config');
const appState = require('./state');
const { setIO } = require('./logger');

const app = express();
const server = http.createServer(app);

// ── Network stats tracker ──────────────────────────────────────────────────
let netPrev = null;
let netPrevTime = null;
let netSpeedRx = 0, netSpeedTx = 0;
let netTotalRx = 0, netTotalTx = 0;

function readNetStats() {
    try {
        const data = fs.readFileSync('/proc/net/dev', 'utf8');
        let rx = 0, tx = 0;
        data.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10 || parts[0].startsWith('Inter') || parts[0].startsWith('face')) return;
            const iface = parts[0].replace(':', '');
            if (iface === 'lo') return;
            rx += parseInt(parts[1]) || 0;
            tx += parseInt(parts[9]) || 0;
        });
        return { rx, tx };
    } catch { return null; }
}

function updateNetSpeed() {
    const now = Date.now();
    const cur = readNetStats();
    if (!cur) return;
    if (netPrev && netPrevTime) {
        const dt = (now - netPrevTime) / 1000;
        netSpeedRx = Math.max(0, Math.round((cur.rx - netPrev.rx) / dt));
        netSpeedTx = Math.max(0, Math.round((cur.tx - netPrev.tx) / dt));
        netTotalRx = cur.rx;
        netTotalTx = cur.tx;
    } else {
        netTotalRx = cur.rx;
        netTotalTx = cur.tx;
    }
    netPrev = cur;
    netPrevTime = now;
}

// Sample every 2 seconds
const netBaseline = readNetStats();
if (netBaseline) { netTotalRx = netBaseline.rx; netTotalTx = netBaseline.tx; netPrev = netBaseline; netPrevTime = Date.now(); }
setInterval(updateNetSpeed, 2000);

const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── JWT middleware ─────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        req.admin = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// ── Auth ───────────────────────────────────────────────────────────────────
app.post('/bot-api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ token, username });
    }
    res.status(401).json({ error: 'Invalid credentials' });
});

// ── Stats ──────────────────────────────────────────────────────────────────
app.get('/bot-api/stats', authMiddleware, (req, res) => {
    const memTotal = os.totalmem();
    const memFree  = os.freemem();
    const memUsed  = memTotal - memFree;
    const cpuLoad  = os.loadavg()[0];

    let fileCount = 0, fileSize = 0;
    try {
        const files = fs.readdirSync(DOWNLOAD_DIR);
        fileCount = files.length;
        files.forEach(f => {
            try { fileSize += fs.statSync(path.join(DOWNLOAD_DIR, f)).size; } catch {}
        });
    } catch {}

    let userCount = 0;
    try {
        const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        userCount = Object.keys(db.users || {}).length;
    } catch {}

    let currentStatus = appState.getStatus();
    let currentNumber = appState.getNumber();
    try {
        const sm = require('./session-manager');
        const cSession = sm.getAll().find(s => s.status === 'Connected');
        if (cSession && currentStatus !== 'Connected') {
            currentStatus = 'Connected';
            currentNumber = cSession.number;
        }
    } catch(e) {}

    function fmtBytes(b) {
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
        return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }
    function fmtSpeed(bps) {
        if (bps < 1024) return bps + ' B/s';
        if (bps < 1024 * 1024) return (bps / 1024).toFixed(1) + ' KB/s';
        return (bps / 1024 / 1024).toFixed(2) + ' MB/s';
    }

    let sessionCount = 1; // main bot
    try {
        const sm = require('./session-manager');
        sessionCount += sm.getAll().length;
    } catch {}

    let broadcastCount = 0;
    try {
        const dbObj = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        broadcastCount = (dbObj.broadcastHistory || []).length;
    } catch {}

    res.json({
        status: currentStatus,
        number: currentNumber,
        connectedAt: appState.getConnectedAt(),
        uptime: Math.floor(process.uptime()),
        memUsed: Math.round(memUsed / 1024 / 1024),
        memTotal: Math.round(memTotal / 1024 / 1024),
        memPercent: Math.round((memUsed / memTotal) * 100),
        cpuLoad: cpuLoad.toFixed(2),
        platform: os.platform(),
        nodeVersion: process.version,
        userCount,
        sessionCount,
        broadcastCount,
        fileCount,
        fileSizeMB: (fileSize / 1024 / 1024).toFixed(1),
        net: {
            speedRx: fmtSpeed(netSpeedRx),
            speedTx: fmtSpeed(netSpeedTx),
            speedRxRaw: netSpeedRx,
            speedTxRaw: netSpeedTx,
            totalRx: fmtBytes(netTotalRx),
            totalTx: fmtBytes(netTotalTx),
            totalRxRaw: netTotalRx,
            totalTxRaw: netTotalTx,
        },
    });
});

// ── Sessions (Main bot) ────────────────────────────────────────────────────
app.get('/bot-api/bot/session', authMiddleware, (req, res) => {
    const sock = appState.getSocket();
    res.json({
        id: '__main__',
        label: 'Main Bot',
        number: appState.getNumber() || null,
        status: appState.getStatus(),
        connectedAt: appState.getConnectedAt(),
        platform: sock?.authState?.creds?.platform || 'whatsapp',
        isMain: true,
    });
});

app.post('/bot-api/sessions/__main__/paircode', authMiddleware, async (req, res) => {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    const sock = appState.getSocket();
    if (!sock) return res.status(400).json({ error: 'Bot socket not ready' });
    const status = appState.getStatus();
    if (status === 'Connected') return res.status(400).json({ error: 'Already connected' });
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (!cleaned || cleaned.length < 7) return res.status(400).json({ error: 'Invalid phone number' });
    try {
        const code = await sock.requestPairingCode(cleaned);
        appState.setMainPairCode(code);
        io.emit('update', { pairCode: code });
        res.json({ ok: true, code });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/bot-api/bot/session/logout', authMiddleware, async (req, res) => {
    const sock = appState.getSocket();
    if (!sock) return res.status(400).json({ error: 'No active main session' });
    try {
        await sock.logout();
        appState.setSocket(null);
        appState.setStatus('Disconnected');
        appState.setNumber(null);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Multi-Session Manager API ──────────────────────────────────────────────
app.get('/bot-api/sessions', authMiddleware, (req, res) => {
    const sessionMgr = require('./session-manager');
    const multiSessions = sessionMgr.getAll();

    // Include the main bot as a special session
    const mainStatus = appState.getStatus();
    const mainSession = {
        id: '__main__',
        label: 'Main Bot',
        number: appState.getNumber() || null,
        status: mainStatus,
        isMain: true,
        startedAt: appState.getConnectedAt() || null,
        qrAvailable: !!appState.getMainQr() && mainStatus !== 'Connected',
        pairCode: mainStatus !== 'Connected' ? (appState.getMainPairCode() || null) : null,
    };

    res.json([mainSession, ...multiSessions]);
});

app.post('/bot-api/sessions', authMiddleware, async (req, res) => {
    const { id, pairMode, phone } = req.body || {};
    if (!id || !/^[a-zA-Z0-9_-]{2,30}$/.test(id)) {
        return res.status(400).json({ error: 'Invalid session ID (2–30 alphanumeric chars)' });
    }
    if (pairMode && phone) {
        const cleaned = phone.replace(/[^0-9]/g, '');
        if (!cleaned || cleaned.length < 7) return res.status(400).json({ error: 'Invalid phone number' });
    }
    const sessionMgr = require('./session-manager');
    const result = await sessionMgr.createSession(id, { pairMode: !!pairMode, phone: phone || '' });
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

app.delete('/bot-api/sessions/:id', authMiddleware, async (req, res) => {
    const sessionMgr = require('./session-manager');
    const result = await sessionMgr.removeSession(req.params.id);
    res.json(result);
});

app.post('/bot-api/sessions/:id/paircode', authMiddleware, async (req, res) => {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    const sessionMgr = require('./session-manager');
    const result = await sessionMgr.requestPairCode(req.params.id, phone);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

app.get('/bot-api/sessions/:id/qr', authMiddleware, (req, res) => {
    const { id } = req.params;
    if (id === '__main__') {
        const qr = appState.getMainQr();
        if (!qr) return res.status(404).json({ error: 'No QR available — bot may already be connected' });
        return res.json({ qrCode: qr });
    }
    const sessionMgr = require('./session-manager');
    const entry = sessionMgr.get(id);
    if (!entry) return res.status(404).json({ error: 'Session not found' });
    if (!entry.qrDataUrl) return res.status(404).json({ error: 'No QR available' });
    res.json({ qrCode: entry.qrDataUrl });
});

app.post('/bot-api/sessions/:id/disconnect', authMiddleware, async (req, res) => {
    const { id } = req.params;
    if (id === '__main__') {
        const sock = appState.getSocket();
        if (!sock) return res.status(400).json({ error: 'Main bot not connected' });
        try {
            await sock.logout();
            appState.setSocket(null);
            appState.setStatus('Disconnected');
            appState.setNumber(null);
            appState.setMainQr(null);
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
        return;
    }
    const sessionMgr = require('./session-manager');
    const result = await sessionMgr.removeSession(id);
    res.json(result);
});

// ── Broadcast ──────────────────────────────────────────────────────────────
app.post('/bot-api/broadcast', authMiddleware, async (req, res) => {
    const sock = appState.getSocket();
    if (!sock) return res.status(400).json({ error: 'Bot is not connected' });

    const { message, targets } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message is required' });

    let jids = targets;
    if (!jids || !jids.length) {
        try {
            const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
            jids = Object.keys(db.users || {});
        } catch { jids = []; }
    }

    const results = { sent: 0, failed: 0, total: jids.length, errors: [] };
    for (const jid of jids.slice(0, 50)) {
        try {
            await sock.sendMessage(jid, { text: message });
            results.sent++;
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            results.failed++;
            results.errors.push({ jid, error: e.message });
        }
    }

    // Save broadcast to history
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const dbObj = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        if (!dbObj.broadcastHistory) dbObj.broadcastHistory = [];
        dbObj.broadcastHistory.unshift({
            id: Date.now().toString(),
            message: message.substring(0, 200),
            targets: (targets || []).slice(0, 5),
            sent: results.sent,
            failed: results.failed,
            total: results.total,
            sentAt: new Date().toISOString(),
            status: results.failed === 0 ? 'success' : results.sent === 0 ? 'failed' : 'partial',
        });
        if (dbObj.broadcastHistory.length > 50) dbObj.broadcastHistory = dbObj.broadcastHistory.slice(0, 50);
        fs.writeFileSync(dbPath, JSON.stringify(dbObj, null, 2));
    } catch {}

    res.json(results);
});

app.get('/bot-api/broadcast/history', authMiddleware, (req, res) => {
    try {
        const dbObj = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        res.json(dbObj.broadcastHistory || []);
    } catch { res.json([]); }
});

// ── Bot Control ────────────────────────────────────────────────────────────
app.post('/bot-api/admin/restart', authMiddleware, (req, res) => {
    appState.requestRestart();
    res.json({ ok: true, message: 'Restart queued — reconnecting in ~5 seconds' });
    setTimeout(() => {
        if (appState.isRestartRequested()) {
            appState.clearRestart();
            const { startBot } = require('./bot');
            startBot().catch(console.error);
        }
    }, 5000);
});

// ── Settings ───────────────────────────────────────────────────────────────
app.get('/bot-api/settings', authMiddleware, (req, res) => {
    const cfg = require('./config');
    let dbSettings = {};
    try {
        const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        dbSettings = db.settings || {};
    } catch {}
    res.json({
        botName: dbSettings.botName || cfg.BOT_NAME,
        prefix: dbSettings.prefix || cfg.PREFIX,
        ownerNumber: cfg.OWNER_NUMBER,
        autoRead: dbSettings.autoRead !== undefined ? dbSettings.autoRead : cfg.AUTO_READ,
        autoTyping: dbSettings.autoTyping !== undefined ? dbSettings.autoTyping : cfg.AUTO_TYPING,
        nsfwEnabled: dbSettings.nsfwEnabled !== undefined ? dbSettings.nsfwEnabled : cfg.NSFW_ENABLED,
        premiumCode: cfg.PREMIUM_CODE,
    });
});

app.post('/bot-api/settings', authMiddleware, (req, res) => {
    const { botName, prefix, autoRead, autoTyping, nsfwEnabled } = req.body || {};
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        if (!db.settings) db.settings = {};
        if (botName !== undefined) db.settings.botName = botName;
        if (prefix !== undefined) db.settings.prefix = prefix;
        if (autoRead !== undefined) db.settings.autoRead = autoRead;
        if (autoTyping !== undefined) db.settings.autoTyping = autoTyping;
        if (nsfwEnabled !== undefined) db.settings.nsfwEnabled = nsfwEnabled;
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Economy ────────────────────────────────────────────────────────────────
app.get('/bot-api/economy', authMiddleware, (req, res) => {
    try {
        const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        const users = db.users || {};
        const list = Object.entries(users).map(([jid, data]) => ({
            jid,
            number: jid.split('@')[0],
            balance: data.balance || 0,
            premium: data.premium || false,
            wins: data.wins || 0,
            dailyLast: data.dailyLast || null,
        }));
        res.json(list);
    } catch { res.json([]); }
});

app.post('/bot-api/economy/edit', authMiddleware, (req, res) => {
    const { jid, balance } = req.body || {};
    if (!jid || balance === undefined) return res.status(400).json({ error: 'jid and balance required' });
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (!db.users) db.users = {};
        if (!db.users[jid]) db.users[jid] = {};
        db.users[jid].balance = Number(balance);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/bot-api/economy/reset', authMiddleware, (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        Object.keys(db.users || {}).forEach(jid => {
            db.users[jid].balance = 0;
            db.users[jid].wins = 0;
        });
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── File Manager ───────────────────────────────────────────────────────────
app.get('/bot-api/files', authMiddleware, (req, res) => {
    try {
        const files = fs.readdirSync(DOWNLOAD_DIR).map(name => {
            const fPath = path.join(DOWNLOAD_DIR, name);
            try {
                const stat = fs.statSync(fPath);
                return {
                    name,
                    sizeMB: (stat.size / 1024 / 1024).toFixed(2),
                    modified: stat.mtime.toISOString(),
                    ext: path.extname(name).slice(1).toLowerCase() || 'file',
                };
            } catch { return null; }
        }).filter(Boolean).sort((a, b) => new Date(b.modified) - new Date(a.modified));
        res.json(files);
    } catch { res.json([]); }
});

app.delete('/bot-api/files/:name', authMiddleware, (req, res) => {
    const name = path.basename(req.params.name);
    const fPath = path.join(DOWNLOAD_DIR, name);
    if (!fs.existsSync(fPath)) return res.status(404).json({ error: 'File not found' });
    try {
        fs.unlinkSync(fPath);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Commands List ──────────────────────────────────────────────────────────
app.get('/bot-api/commands', authMiddleware, (req, res) => {
    try {
        const commandsDir = path.join(__dirname, 'lib', 'commands');
        const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
        const list = [];
        const seen = new Set();
        let dbSettings = {};
        try {
            const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
            dbSettings = db.commandSettings || {};
        } catch {}
        files.forEach(file => {
            try {
                const cmd = require(path.join(commandsDir, file));
                if (cmd.name && !seen.has(cmd.name)) {
                    seen.add(cmd.name);
                    const overrides = dbSettings[cmd.name] || {};
                    list.push({
                        name: cmd.name,
                        aliases: cmd.aliases || [],
                        description: cmd.description || '',
                        category: file.replace('.js', ''),
                        enabled: overrides.enabled !== undefined ? overrides.enabled : true,
                        cooldown: cmd.cooldown || 0,
                        pmOnly: cmd.pmOnly || false,
                        groupOnly: cmd.groupOnly || false,
                        premiumOnly: cmd.premiumOnly || false,
                        ownerOnly: cmd.ownerOnly || false,
                        usageCount: overrides.usageCount || 0,
                    });
                }
            } catch {}
        });
        res.json(list);
    } catch (e) { res.json([]); }
});

app.patch('/bot-api/commands/:name', authMiddleware, (req, res) => {
    const { name } = req.params;
    const { enabled } = req.body || {};
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        if (!db.commandSettings) db.commandSettings = {};
        if (!db.commandSettings[name]) db.commandSettings[name] = {};
        if (enabled !== undefined) db.commandSettings[name].enabled = enabled;
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/bot-api/commands/toggle-all', authMiddleware, (req, res) => {
    const { enabled, category } = req.body || {};
    try {
        const commandsDir = path.join(__dirname, 'lib', 'commands');
        const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        if (!db.commandSettings) db.commandSettings = {};
        files.forEach(file => {
            if (category && file.replace('.js', '') !== category) return;
            try {
                const cmd = require(path.join(commandsDir, file));
                if (cmd.name) {
                    if (!db.commandSettings[cmd.name]) db.commandSettings[cmd.name] = {};
                    db.commandSettings[cmd.name].enabled = enabled;
                }
            } catch {}
        });
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Groups Management ──────────────────────────────────────────────────────
app.get('/bot-api/groups', authMiddleware, (req, res) => {
    try {
        const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        const groups = db.groups || {};
        const list = Object.entries(groups).map(([jid, data]) => ({
            jid,
            name: data.name || jid.split('@')[0],
            sessionId: data.sessionId || 'main',
            memberCount: data.memberCount || 0,
            isMuted: data.isMuted || false,
            antiLink: data.antiLink || false,
            antiSpam: data.antiSpam || false,
            welcomeEnabled: data.welcomeEnabled || false,
            welcomeMessage: data.welcomeMessage || 'Welcome to the group!',
            goodbyeEnabled: data.goodbyeEnabled || false,
            nsfw: data.nsfw || false,
        }));
        res.json(list);
    } catch { res.json([]); }
});

app.patch('/bot-api/groups/:jid', authMiddleware, (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        if (!db.groups) db.groups = {};
        if (!db.groups[jid]) db.groups[jid] = {};
        Object.assign(db.groups[jid], req.body);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/bot-api/groups/:jid', authMiddleware, (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        if (db.groups && db.groups[jid]) delete db.groups[jid];
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Scheduler ──────────────────────────────────────────────────────────────
app.get('/bot-api/scheduler', authMiddleware, (req, res) => {
    try {
        const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        res.json(db.scheduler || []);
    } catch { res.json([]); }
});

app.post('/bot-api/scheduler', authMiddleware, (req, res) => {
    const { message, sessionId, targetType, targets, scheduledAt } = req.body || {};
    if (!message || !scheduledAt) return res.status(400).json({ error: 'message and scheduledAt required' });
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        if (!db.scheduler) db.scheduler = [];
        const item = {
            id: Date.now().toString(),
            message,
            sessionId: sessionId || 'main',
            targetType: targetType || 'all',
            targets: targets || [],
            scheduledAt,
            sent: false,
            sentAt: null,
            createdAt: new Date().toISOString(),
        };
        db.scheduler.push(item);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/bot-api/scheduler/:id', authMiddleware, (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        db.scheduler = (db.scheduler || []).filter(s => s.id !== req.params.id);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Auto-Reply ─────────────────────────────────────────────────────────────
app.get('/bot-api/auto-reply', authMiddleware, (req, res) => {
    try {
        const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        res.json(db.autoReply || []);
    } catch { res.json([]); }
});

app.post('/bot-api/auto-reply', authMiddleware, (req, res) => {
    const { trigger, response, matchType, caseSensitive, groupsOnly, pmOnly } = req.body || {};
    if (!trigger || !response) return res.status(400).json({ error: 'trigger and response required' });
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        if (!db.autoReply) db.autoReply = [];
        const rule = {
            id: Date.now().toString(),
            trigger, response,
            matchType: matchType || 'exact',
            caseSensitive: !!caseSensitive,
            groupsOnly: !!groupsOnly,
            pmOnly: !!pmOnly,
            enabled: true,
        };
        db.autoReply.push(rule);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json(rule);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/bot-api/auto-reply/:id', authMiddleware, (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        const idx = (db.autoReply || []).findIndex(r => r.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Rule not found' });
        Object.assign(db.autoReply[idx], req.body);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/bot-api/auto-reply/:id', authMiddleware, (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : '{}');
        db.autoReply = (db.autoReply || []).filter(r => r.id !== req.params.id);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Users Management ───────────────────────────────────────────────────────
app.get('/bot-api/users', authMiddleware, (req, res) => {
    try {
        const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
        const users = db.users || {};
        const list = Object.entries(users).map(([jid, data]) => ({
            jid,
            number: jid.split('@')[0],
            balance: data.balance || 0,
            premium: data.premium || false,
            wins: data.wins || 0,
            losses: data.losses || 0,
            dailyLast: data.dailyLast || null,
            banned: data.banned || false,
            joinedAt: data.joinedAt || null,
            lastSeen: data.lastSeen || null,
        }));
        res.json(list);
    } catch { res.json([]); }
});

app.post('/bot-api/users/:jid/premium', authMiddleware, (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (!db.users) db.users = {};
        if (!db.users[jid]) db.users[jid] = {};
        // If body contains explicit value, use it; otherwise toggle
        const body = req.body || {};
        const newValue = body.premium !== undefined ? !!body.premium : !db.users[jid].premium;
        db.users[jid].premium = newValue;
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true, premium: newValue });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/bot-api/users/:jid/ban', authMiddleware, (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (!db.users) db.users = {};
        if (!db.users[jid]) db.users[jid] = {};
        const body = req.body || {};
        const newValue = body.banned !== undefined ? !!body.banned : !db.users[jid].banned;
        db.users[jid].banned = newValue;
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true, banned: newValue });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/bot-api/users/:jid', authMiddleware, (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    try {
        const dbPath = path.join(__dirname, 'db.json');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (db.users && db.users[jid]) delete db.users[jid];
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Logs ───────────────────────────────────────────────────────────────────
app.get('/bot-api/logs', authMiddleware, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    res.json(appState.getLogs().slice(-limit).reverse());
});

// ── WebSocket ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    socket.emit('update', {
        status: appState.getStatus(),
        number: appState.getNumber(),
    });
    appState.getLogs().slice(-30).forEach(l => socket.emit('log', l));
});

// ── Fallback (SPA) ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
    if (req.path.startsWith('/bot-api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
function startDashboard() {
    setIO(io);
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use!`);
            console.log(`💡 Try running: "npx kill-port ${PORT}" or close the other bot window.`);
            // Optional: Auto-kill attempt on windows (use with caution)
        } else {
            console.error('Server Error:', err);
        }
    });
}

module.exports = { startDashboard, io };
