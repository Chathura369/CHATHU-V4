"use strict";

const db = require("../db");
const { sendReact, truncate, isOwner } = require("../utils");
const msgMgr = require("../message-manager");

const timers = new Map();

module.exports = [
  {
    name: "autoview",
    description: "Toggle automatic status viewing.",
    category: "automation",
    async execute(sock, msg, from, args) {
      const sender = msg.key.participant || msg.key.remoteJid;
      const isSelf = msg.key.fromMe || isOwner(sender);
      if (!isSelf) {
        return msgMgr.sendTemp(sock, from, "❌ Only bot owner can use this command.", 5000);
      }

      const action = args[0]?.toLowerCase();
      if (action === "on") {
        db.setSetting("auto_view_status", true);
        await msgMgr.send(sock, from, { text: "✅ *Auto-View Status enabled*." });
      } else if (action === "off") {
        db.setSetting("auto_view_status", false);
        await msgMgr.send(sock, from, { text: "✅ *Auto-View Status disabled*." });
      } else {
        const status = db.getSetting("auto_view_status") !== false ? "on" : "off";
        await msgMgr.send(sock, from, { text: `👁️ *Auto-View Status:* ${status.toUpperCase()}\n\nUsage: .autoview [on|off]` });
      }
    },
  },
  {
    name: "autoreact",
    description: "Toggle automatic status reactions.",
    category: "automation",
    async execute(sock, msg, from, args) {
      const sender = msg.key.participant || msg.key.remoteJid;
      const isSelf = msg.key.fromMe || isOwner(sender);
      if (!isSelf) {
        return msgMgr.sendTemp(sock, from, "❌ Only bot owner can use this command.", 5000);
      }

      const action = args[0]?.toLowerCase();
      if (action === "on") {
        db.setSetting("auto_react_status", true);
        await msgMgr.send(sock, from, { text: "✅ *Auto-React Status enabled*." });
      } else if (action === "off") {
        db.setSetting("auto_react_status", false);
        await msgMgr.send(sock, from, { text: "✅ *Auto-React Status disabled*." });
      } else {
        const status = db.getSetting("auto_react_status") === true ? "on" : "off";
        await msgMgr.send(sock, from, { text: `🔥 *Auto-React Status:* ${status.toUpperCase()}\n\nUsage: .autoreact [on|off]` });
      }
    },
  },
  {
  name: "remind",
  aliases: ["reminder"],
  description: "Set a reminder (e.g., .remind 5m call mom)",

  async execute(sock, msg, from, args) {
    if (args.length < 2) {
      return msgMgr.sendTemp(sock, from, "⚠️ Usage: .remind <time><s/m/h> <message>\nExample: .remind 10m buy milk", 6000);
    }

    const timeStr = args[0].toLowerCase();
    const message = args.slice(1).join(" ");
    const sender = msg.key.participant || msg.key.remoteJid;

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

    sendReact(sock, from, msg, "⏰");
    
    await msgMgr.send(sock, from, { text: `✅ Reminder set for *${timeStr}*:\n"${truncate(message, 50)}"` });

    setTimeout(async () => {
      let提醒Msg = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
      提醒Msg += `│   »»——  ʀᴇᴍɪɴᴅᴇʀ  ——««  │\n`;
      提醒Msg += `└────────────────────────────┘\n\n`;
      提醒Msg += ` 🔔 @${sender.split("@")[0]}, time's up!\n\n`;
      提醒Msg += ` 📝 *Message:* ${message}\n\n`;
      提醒Msg += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
      
      await sock.sendMessage(from, { text: 提醒Msg, mentions: [sender] }, { quoted: msg });
    }, ms);
    },
  },
];
