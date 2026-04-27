'use strict';

const appState = require('./state');

let _io = null;
const MAX_LOGS = 500;
const settingsCache = global.settingsCache;
const NOISY_PATTERNS = [
    'Closing session', 'SessionEntry', 'Signal', 'Frame', 
    'Binary', 'Success', 'Stream', 'Node', 'Attribute'
];

function setIO(io) { _io = io; }

function logger(...args) {
    const msg = args.map(arg => {
        if (typeof arg === 'object') {
            try { return JSON.stringify(arg); } catch { return String(arg); }
        }
        return String(arg);
    }).join(' ');
    
    const entry = {
        time: new Date().toISOString(),
        message: msg,
    };
    const logs = appState.getLogs();
    logs.push(entry);

    const stamp = entry.time.split('T')[1].split('.')[0];
    const logStr = entry.message.replace(/\n/g, ' ');
    const isNoisy = NOISY_PATTERNS.some(p => logStr.includes(p));
    
    if (!isNoisy) {
        const truncated = logStr.length > 120 ? logStr.substring(0, 117) + "..." : logStr;
        process.stdout.write(`[${stamp}] ${truncated}\n`);
    }

    if (logs.length > MAX_LOGS) logs.shift();

    try { require('fs').appendFileSync('debug.log', `[${entry.time}] ${entry.message}\n`); } catch (e) {}

    try { if (_io) _io.emit('log', entry); } catch {}
}

module.exports = { logger, setIO };
