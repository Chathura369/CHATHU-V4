"use strict";

const os = require("os");
const { sendReact, truncate } = require("../utils");
const { PREFIX } = require("../../config");
const msgMgr = require("../message-manager");

module.exports = {
  name: "ping",
  aliases: ["alive", "system", "status", "remind", "reminder"],
  description: "System status and tools",

  async execute(sock, msg, from, args) {
    const cmdText =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      "";
    const cmd = cmdText.trim().toLowerCase().split(/\s+/)[0].slice(1);

    const participant = msg.key.participant || msg.key.remoteJid || from;

    switch (cmd) {
      case "ping": {
        await sendReact(sock, from, msg, "🏓");
        const start = Date.now();
        const sent = await sock.sendMessage(from, { text: "🏓 *Pinging CORE Matrix…*" });
        const latency = Date.now() - start;
        try {
          await sock.sendMessage(from, {
            edit: sent.key,
            text: `🏓 *Pong!*\n⚡ Latency: *${latency}ms*\n✅ System fully operational.`,
          });
        } catch {
          await msgMgr.send(sock, from, { text: `🏓 *Pong!* ${latency}ms` });
        }
        await sendReact(sock, from, msg, "✅");
        return;
      }

      case "remind":
      case "reminder": {
        if (args.length < 2) {
          return msgMgr.sendTemp(sock, from, "⚠️ Usage: .remind <time><s/m/h> <message>\nExample: .remind 10m buy milk", 6000);
        }
        const timeStr = args[0].toLowerCase();
        const message = args.slice(1).join(" ");
        const match = timeStr.match(/^(\d+)([smh])$/);
        if (!match) {
          return msgMgr.sendTemp(sock, from, "❌ Invalid time format. Use 10s, 5m, or 1h.", 5000);
        }
        const value = parseInt(match[1]);
        const unit = match[2];
        let ms = value * 1000;
        if (unit === "m") ms *= 60;
        if (unit === "h") ms *= 3600;

        if (ms > 24 * 3600 * 1000) {
          return msgMgr.sendTemp(sock, from, "❌ Maximum reminder time is 24 hours.", 4000);
        }

        await sendReact(sock, from, msg, "⏰");
        await msgMgr.send(sock, from, { text: `✅ *Reminder Matrix Set*\n\n📅 Time: ${timeStr}\n📝 Note: ${truncate(message, 50)}` });

        setTimeout(async () => {
          let remMsg = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
          remMsg += `│   »»——  ʀᴇᴍɪɴᴅᴇʀ  ——««  │\n`;
          remMsg += `└────────────────────────────┘\n\n`;
          remMsg += ` 🔔 @${participant.split("@")[0]}, time's up!\n\n`;
          remMsg += ` 📝 *Message:* ${message}\n\n`;
          remMsg += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
          await sock.sendMessage(from, { text: remMsg, mentions: [participant] }, { quoted: msg });
        }, ms);
        return;
      }
    }

    // Default: system status
    await sendReact(sock, from, msg, "⚙️");
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);

    const totalMem = (os.totalmem() / 1073741824).toFixed(2);
    const usedMem = ((os.totalmem() - os.freemem()) / 1073741824).toFixed(2);
    const procMem = (process.memoryUsage().rss / 1048576).toFixed(1);

    let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
    reply += `│   »»——  sʏsᴛᴇᴍ ᴄᴏʀᴇ  ——««  │\n`;
    reply += `└────────────────────────────┘\n\n`;
    reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
    reply += ` ┃ ⌕ ᴜsᴇʀ   : @${participant.split('@')[0]}\n`;
    reply += ` ┃ ⌕ ᴜᴘᴛɪᴍᴇ : ${h}h ${m}m ${s}s\n`;
    reply += ` ┃ ⌕ ᴘʀᴇғɪx : [ ${PREFIX} ]\n`;
    reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
    reply += `  【 ☁️ ʜᴀʀᴅᴡᴀʀᴇ sᴘᴇᴄs 】\n`;
    reply += `  ► Memory\n`;
    reply += `    ┖ ${usedMem}GB / ${totalMem}GB\n`;
    reply += `  ► Process RSS\n`;
    reply += `    ┖ ${procMem}MB\n`;
    reply += `  ► Platform\n`;
    reply += `    ┖ ${os.type()} ${os.arch()}\n\n`;
    reply += `  【 ☁️ sᴛᴀᴛᴜs 】\n`;
    reply += `  ► All systems operational ✅\n\n`;
    reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;

    await sock.sendMessage(from, { text: reply, mentions: [participant], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
    await sendReact(sock, from, msg, "✅");
  },
};
