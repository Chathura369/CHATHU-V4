"use strict";

const { sendReact } = require("../utils");
const msgMgr = require("../message-manager");

module.exports = {
  name: "steal",
  aliases: ["ss", "statussteal"],
  description: "Steal (download) a status message",

  async execute(sock, msg, from, args) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      return msgMgr.sendTemp(sock, from, "⚠️ Please reply to a status message to steal it.", 5000);
    }

    sendReact(sock, from, msg, "📥");

    try {
      // Re-send the quoted content (image/video/audio) to the current chat
      const content = {};
      if (quoted.imageMessage) content.image = quoted.imageMessage;
      else if (quoted.videoMessage) content.video = quoted.videoMessage;
      else if (quoted.audioMessage) content.audio = quoted.audioMessage;
      else if (quoted.documentMessage) content.document = quoted.documentMessage;
      else if (quoted.conversation) content.text = quoted.conversation;
      else if (quoted.extendedTextMessage) content.text = quoted.extendedTextMessage.text;

      if (Object.keys(content).length === 0) {
        return msgMgr.sendTemp(sock, from, "❌ Unsupported status type.", 4000);
      }

      const originalCaption = quoted.imageMessage?.caption || quoted.videoMessage?.caption || "";
      let caption = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
      caption += `┃   📥 𝕊𝕋𝔸𝕋𝕌𝕊 𝕊𝕋𝔼𝔸𝔼ℝ 📥    ┃\n`;
      caption += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
      if (originalCaption) caption += `📝 *Caption:* ${originalCaption}\n\n`;
      caption += `👾 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 👾`;
      
      content.caption = caption;
      
      await sock.sendMessage(from, content, { quoted: msg });
      await sendReact(sock, from, msg, "✅");
    } catch (err) {
      await msgMgr.sendTemp(sock, from, `❌ Failed to steal status: ${err.message}`, 5000);
    }
  },
};
