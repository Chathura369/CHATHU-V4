"use strict";

const axios = require("axios");
const { sendReact } = require("../utils");
const msgMgr = require("../message-manager");
const db = require("../db");
const { handleAPIError } = require("../error-handler");
const { isGroupAdmin, isOwner } = require("../utils");
const { NSFW_ENABLED } = require("../../config");

const NSFW_SOURCES = [
  { tag: "boobs", url: "https://api.waifu.pics/nsfw/waifu" },
  { tag: "ass", url: "https://api.waifu.pics/nsfw/waifu" },
  { tag: "waifu", url: "https://api.waifu.pics/nsfw/waifu" },
  { tag: "blowjob", url: "https://api.waifu.pics/nsfw/blowjob" },
];

function isNsfwEnabled(from) {
  const g = db.get("groups", from) || {};
  return !!g.nsfw;
}

module.exports = {
  name: "nsfw",
  aliases: ["nsfwtoggle", "boobs", "ass", "waifu", "blowjob"],
  description: "NSFW content (groups only, must be enabled by admin)",

  async execute(sock, msg, from, args) {
    const isGroup = from.endsWith("@g.us");
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!isGroup) {
      if (!NSFW_ENABLED && !isOwner(sender)) {
        return msgMgr.sendTemp(sock, from, "🔞 Private NSFW is disabled in config.", 5000);
      }
    }

    const cmdText =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      "";
    const cmd = cmdText.trim().toLowerCase().split(/\s+/)[0].slice(1);

    if (cmd === "nsfwtoggle" || cmd === "nsfw") {
      if (!isGroup)
        return msgMgr.sendTemp(sock, from, "⚠️ Admins toggle is for groups only.", 4000);
      const adminOk = await isGroupAdmin(sock, from, sender);
      if (!adminOk && !isOwner(sender)) {
        return msgMgr.sendTemp(sock, from, "❌ Admins only can toggle NSFW.", 4000);
      }
      const val = args[0]?.toLowerCase();
      if (val !== "on" && val !== "off") {
        return msgMgr.sendTemp(sock, from, "⚠️ Usage: .nsfw on / .nsfw off", 5000);
      }
      db.update("groups", from, { nsfw: val === "on" });
      let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
      reply += `│   »»——  ᴘʀɪᴠᴀᴄʏ ᴜᴘᴅᴀᴛᴇ  ——««  │\n`;
      reply += `└────────────────────────────┘\n\n`;
      reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
      reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
      reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
      reply += `  【 ☁️ ɴsғᴡ ᴍᴏᴅᴇ 】\n`;
      reply += `  ► Status\n`;
      reply += `    ┖ ${val.toUpperCase()}\n\n`;
      reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
      await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
      await sendReact(sock, from, msg, "✅");
      return;
    }

    if (isGroup && !isNsfwEnabled(from)) {
      return msgMgr.sendTemp(
        sock,
        from,
        "🔞 NSFW is not enabled in this group.\nAsk an admin: `.nsfw on`",
        6000,
      );
    }

    const source = NSFW_SOURCES.find((s) => s.tag === cmd) || NSFW_SOURCES[0];
    await sendReact(sock, from, msg, "🔞");

    try {
      const { data } = await axios.get(source.url, { timeout: 10000 });
      const url = data?.url;
      if (!url) throw new Error("No image URL returned");

      let caption = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
      caption += `│   »»——  ${cmd.toUpperCase()}  ——««  │\n`;
      caption += `└────────────────────────────┘\n\n`;
      caption += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
      caption += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
      caption += ` ╰━━━━━━━━━━━━━━━\n\n`;
      caption += `  【 ☁️ ᴄᴏɴᴛᴇɴᴛ 】\n`;
      caption += `  ► Adult Registry\n\n`;
      caption += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
      
      await sock.sendMessage(from, {
        image: { url },
        caption: caption,
        mentions: [sender],
        contextInfo: { isForwarded: true, forwardingScore: 999 }
      }, { quoted: msg });
      await sendReact(sock, from, msg, "✅");
    } catch (err) {
      const fe = handleAPIError(err, "NSFW");
      await msgMgr.sendTemp(sock, from, `❌ ${fe.message}`, 5000);
      await sendReact(sock, from, msg, "❌");
    }
  },
};
