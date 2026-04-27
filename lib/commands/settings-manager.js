'use strict';

const msgMgr = require('../message-manager');
const { isOwner, sendReact } = require('../utils');
const db = require('../db');
const appState = require('../../state');
const themeMgr = require('../theme-manager');
const config = require('../../config');
const axios = require('axios');
const os = require('os');

if (!global.settingsCache) {
    global.settingsCache = new Map();
}
const settingsCache = global.settingsCache;

async function checkIndividualAPI(service) {
    const start = Date.now();
    try {
        if (service === 'gemini' && config.GEMINI_API_KEY) {
            await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.GEMINI_API_KEY}`, { timeout: 2000 });
            return `✅ (${Date.now() - start}ms)`;
        }
        if (service === 'openrouter' && config.OPENROUTER_API_KEY) {
            await axios.get('https://openrouter.ai/api/v1/models', { headers: { 'Authorization': `Bearer ${config.OPENROUTER_API_KEY}` }, timeout: 2000 });
            return `✅ (${Date.now() - start}ms)`;
        }
        if (service === 'groq' && config.GROQ_API_KEY) {
            await axios.get('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': `Bearer ${config.GROQ_API_KEY}` }, timeout: 2000 });
            return `✅ (${Date.now() - start}ms)`;
        }
    } catch { return '⚠️ Error'; }
    return '❌ Missing';
}

function getUptime() {
    const seconds = Math.floor(process.uptime());
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
}

function getSessionSettings() {
    return {
        autoRead: appState.getAutoRead() !== false,
        autoTyping: appState.getAutoTyping() !== false,
        autoReactStatus: appState.getAutoReactStatus() === true,
        nsfwEnabled: appState.getNsfwEnabled() !== false,
        autoReply: appState.getAutoReply() !== false,
        aiAuto: appState.getAiAutoReply() === true,
        aiVoice: appState.getAiAutoVoice() === true,
        aiPersona: appState.getAiAutoPersona() || 'friendly',
        aiLang: appState.getAiAutoLang() || 'auto',
        aiGroupMode: appState.getAiGroupMode() || 'mention',
        autoStatus: appState.getAutoStatus() !== false,
        botEnabled: appState.getBotEnabled() !== false,
        workMode: appState.getWorkMode() || 'public'
    };
}

async function updateSessionSetting(key, value) {
    const setters = {
        autoRead: appState.setAutoRead,
        autoTyping: appState.setAutoTyping,
        autoReactStatus: appState.setAutoReactStatus,
        nsfwEnabled: appState.setNsfwEnabled,
        autoReply: appState.setAutoReply,
        aiAuto: appState.setAiAutoReply,
        aiVoice: appState.setAiAutoVoice,
        aiPersona: appState.setAiAutoPersona,
        aiLang: appState.setAiAutoLang,
        aiGroupMode: appState.setAiGroupMode,
        autoStatus: (v) => { appState.setAutoStatus(v); db.setSetting('auto_view_status', v); },
        botEnabled: appState.setBotEnabled,
        workMode: appState.setWorkMode
    };
    if (setters[key]) {
        setters[key](value);
        return true;
    }
    return false;
}

const ORDERED_SETTINGS = [
    { label: 'Bot Status', key: 'botEnabled', type: 'bool', icon: '🤖' },
    { label: 'Auto Status', key: 'autoStatus', type: 'bool', icon: '📺' },
    { label: 'Auto React', key: 'autoReactStatus', type: 'bool', icon: '🎭' },
    { label: 'Auto Read', key: 'autoRead', type: 'bool', icon: '📖' },
    { label: 'Auto Typing', key: 'autoTyping', type: 'bool', icon: '⌨️' },
    { label: 'AI Auto-Reply', key: 'aiAuto', type: 'bool', icon: '🧠' },
    { label: 'AI Voice Mode', key: 'aiVoice', type: 'bool', icon: '🔊' },
    { label: 'Std Auto-Reply', key: 'autoReply', type: 'bool', icon: '📩' },
    { label: 'NSFW Filter', key: 'nsfwEnabled', type: 'bool', icon: '🔞' },
    { label: 'AI Persona', key: 'aiPersona', type: 'cycle', options: ['friendly', 'funny', 'savage', 'romantic', 'professional', 'robot'], icon: '👤' },
    { label: 'AI Language', key: 'aiLang', type: 'cycle', options: ['auto', 'si', 'en'], icon: '🌐' },
    { label: 'Group AI Mode', key: 'aiGroupMode', type: 'cycle', options: ['mention', 'always'], icon: '👥' },

    { label: 'Update Gemini', service: 'gemini', type: 'action', icon: '💎' },
    { label: 'Update OpenRouter', service: 'openrouter', type: 'action', icon: '🌍' },
    { label: 'Update Groq', service: 'groq', type: 'action', icon: '⚡' }
];

module.exports = [
    {
        name: 'settings',
        aliases: ['status', 'config', 'panel'],
        category: 'system',
        execute: async (sock, msg, from, args, cmdName, context) => {
            const sender = msg.key.participant || msg.key.remoteJid;
            const ownerRefs = context.owner ? [context.owner] : [];
            const tCtx = { sender, ownerRefs };

            if (!msg.key.fromMe && !isOwner(sender, ownerRefs)) return;

            await sendReact(sock, from, msg, "⏳");

            const start = Date.now();
            const [gemStatus, orStatus, groqStatus] = await Promise.all([
                checkIndividualAPI('gemini'),
                checkIndividualAPI('openrouter'),
                checkIndividualAPI('groq')
            ]);
            const ping = Date.now() - start;

            const settings = getSessionSettings();
            const used = process.memoryUsage().heapUsed / 1024 / 1024;
            const prefix = context.prefix || '.';

            let response = themeMgr.format("header", { title: "CHATHU MD PRO PANEL" }, tCtx);
            response += "\n";

            // System Health
            response += themeMgr.format("box_start", { title: "💻 SYSTEM HEALTH" }, tCtx);
            response += themeMgr.format("box_item", { bullet: "default", content: `*Uptime:* ${getUptime()}` }, tCtx);
            response += themeMgr.format("box_item", { bullet: "default", content: `*RAM:* ${Math.round(used)}MB | *Ping:* ${ping}ms` }, tCtx);
            response += themeMgr.format("box_item", { bullet: "default", content: `*Platform:* ${os.platform()} (${os.arch()})` }, tCtx);
            response += themeMgr.format("box_end", {}, tCtx);
            response += "\n";

            // AI Services
            response += themeMgr.format("box_start", { title: "🧠 AI ENGINE STATUS" }, tCtx);
            response += themeMgr.format("box_item", { bullet: "default", content: `*Gemini:* ${gemStatus}` }, tCtx);
            response += themeMgr.format("box_item", { bullet: "default", content: `*OpenRouter:* ${orStatus}` }, tCtx);
            response += themeMgr.format("box_item", { bullet: "default", content: `*Groq AI:* ${groqStatus}` }, tCtx);
            response += themeMgr.format("box_end", {}, tCtx);
            response += "\n";

            // Main Controls
            response += themeMgr.format("box_start", { title: "⚙️ COMMAND CENTER" }, tCtx);
            ORDERED_SETTINGS.forEach((s, i) => {
                let status = '';
                if (s.type === 'bool') status = settings[s.key] ? '🟢 ON' : '🔴 OFF';
                else if (s.type === 'cycle') status = `[ ${settings[s.key].toUpperCase()} ]`;
                else if (s.type === 'action') status = '✎ EDIT';

                const n = i + 1;
                const emojiNum = n.toString().split('').map(d => d + '\u20E3').join('');
                response += themeMgr.format("box_item", { bullet: "default", content: `${emojiNum}  ➔  ${s.icon} *${s.label}:* ${status}` }, tCtx);
            });



            response += themeMgr.format("box_end", {}, tCtx);

            response += "\n";
            response += themeMgr.format("box_start", { title: "💡 PRO TIP" }, tCtx);
            response += themeMgr.format("box_item", { bullet: "default", content: "Reply with a number to toggle/update." }, tCtx);
            response += themeMgr.format("box_item", { bullet: "default", content: `Current Mode: *${settings.workMode.toUpperCase()}*` }, tCtx);
            response += themeMgr.format("box_end", {}, tCtx);

            response += themeMgr.getSignature(sender, ownerRefs);

            const sent = await msgMgr.send(sock, from, { text: response }, { quoted: msg });
            settingsCache.set(sent.key.id, { sender, settings, prefix });
            setTimeout(() => settingsCache.delete(sent.key.id), 300000);
            await sendReact(sock, from, msg, "🛡️");
        }
    },
    {
        name: 'setkey',
        category: 'system',
        execute: async (sock, msg, from, args, cmdName, context) => {
            const sender = msg.key.participant || msg.key.remoteJid;
            const ownerRefs = context.owner ? [context.owner] : [];
            if (!msg.key.fromMe && !isOwner(sender, ownerRefs)) return;

            const service = args[0]?.toLowerCase();
            const newKey = args[1];
            if (!service || !newKey) return await msgMgr.send(sock, from, { text: "⚠️ Usage: *.setkey <gemini/openrouter/groq> <key>*" });

            const fs = require('fs');
            const path = require('path');
            const envPath = path.join(process.cwd(), '.env');
            if (!fs.existsSync(envPath)) fs.writeFileSync(envPath, '');

            let envContent = fs.readFileSync(envPath, 'utf8');
            const envVar = service === 'gemini' ? 'GEMINI_API_KEY' :
                service === 'openrouter' ? 'OPENROUTER_API_KEY' :
                    service === 'groq' ? 'GROQ_API_KEY' : null;

            if (!envVar) return await msgMgr.send(sock, from, { text: "❌ Invalid service name." });

            const regex = new RegExp(`^${envVar}=.*`, 'm');
            if (envContent.match(regex)) envContent = envContent.replace(regex, `${envVar}=${newKey}`);
            else envContent += `\n${envVar}=${newKey}`;

            fs.writeFileSync(envPath, envContent.trim() + '\n');
            config[envVar] = newKey;
            process.env[envVar] = newKey;

            await msgMgr.send(sock, from, { text: `🚀 *${service.toUpperCase()} API KEY* has been successfully updated and secured.` });
            await sendReact(sock, from, msg, "✅");
        }
    },
    {
        name: 'handle_numeric_setting',
        internal: true,
        execute: async (sock, msg, from, num, quotedId, context) => {
            const cache = settingsCache.get(quotedId);
            if (!cache) return false;

            if (cache.type === 'selection') {
                const setting = cache.setting;
                const selectedOpt = setting.options[num - 1];
                if (!selectedOpt) return false;
                
                const success = await updateSessionSetting(setting.key, selectedOpt);
                if (success) {
                    await msgMgr.send(sock, from, { text: `✨ *${setting.label}* set to: *${selectedOpt.toUpperCase()}*` }, { quoted: msg });
                    return true;
                }
                return false;
            }

            const idx = num - 1;
            const setting = ORDERED_SETTINGS[idx];
            if (!setting) return false;

            if (setting.type === 'action') {
                const prefix = cache.prefix || '.';
                await msgMgr.send(sock, from, { text: `📝 *UPDATE ${setting.service.toUpperCase()} KEY*\n\nCopy the command below and add your new key:\n\n\`\`\`${prefix}setkey ${setting.service} \`\`\`` }, { quoted: msg });
                return true;
            }

            let newVal;
            if (setting.type === 'bool') {
                newVal = !cache.settings[setting.key];
            } else if (setting.type === 'cycle') {
                const sender = cache.sender;
                const ownerRefs = context.owner ? [context.owner] : [];
                const tCtx = { sender, ownerRefs };

                let optMsg = themeMgr.format("header", { title: `${setting.icon} ${setting.label.toUpperCase()}` }, tCtx);
                optMsg += "\n" + themeMgr.format("box_start", { title: "SELECT AN OPTION" }, tCtx);
                
                const DESCRIPTIONS = {
                    'friendly': 'හිතවත් මිතුරෙකු ලෙස',
                    'funny': 'විහිළු තහළු කරන මිතුරෙකු ලෙස',
                    'savage': 'ටිකක් Roast කරන, සැර මිතුරෙකු ලෙස',
                    'romantic': 'ආදරණීය මිතුරෙකු ලෙස',
                    'professional': 'වෘත්තීය සහයෙකු ලෙස',
                    'robot': 'තාක්ෂණික බොට් ලෙස',
                    'auto': 'ස්වයංක්‍රීයව (Auto)',
                    'si': 'සිංහල (Sinhala)',
                    'en': 'ඉංග්‍රීසි (English)',
                    'mention': 'Mention කළොත් පමණි',
                    'always': 'සෑම විටම'
                };

                setting.options.forEach((opt, i) => {
                    const isCurrent = cache.settings[setting.key] === opt;
                    const indicator = isCurrent ? ' (Active ✨)' : '';
                    const desc = DESCRIPTIONS[opt] ? `\n    └─ _${DESCRIPTIONS[opt]}_` : '';
                    const n = i + 1;
                    const emojiNum = n.toString().split('').map(d => d + '\u20E3').join('');
                    optMsg += themeMgr.format("box_item", { 
                        bullet: "default", 
                        content: `${emojiNum}  ➔  *${opt.toUpperCase()}*${indicator}${desc}` 
                    }, tCtx);
                });



                
                optMsg += themeMgr.format("box_end", {}, tCtx);
                optMsg += "\n" + themeMgr.format("box_item", { bullet: "default", content: "🔢 Reply with a number to activate." }, tCtx);
                optMsg += themeMgr.getSignature(sender, ownerRefs);
                
                const sent = await msgMgr.send(sock, from, { text: optMsg }, { quoted: msg });
                settingsCache.set(sent.key.id, { sender, setting, type: 'selection' });
                return true;
            }

            const success = await updateSessionSetting(setting.key, newVal);

            if (success) {
                await msgMgr.send(sock, from, { text: `✨ *${setting.label}* updated to: *${String(newVal).toUpperCase()}*` }, { quoted: msg });
                return true;
            }
            return false;
        }
    }
];
