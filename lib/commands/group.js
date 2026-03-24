"use strict";

const { sendReact, isGroupAdmin, isOwner } = require("../utils");
const msgMgr = require("../message-manager");
const db = require("../db");

module.exports = {
  name: "kick",
  aliases: ["add", "promote", "demote", "lock", "unlock", "antilink"],
  description: "Group management tools (admin only)",

  async execute(sock, msg, from, args) {
    if (!from.endsWith("@g.us")) {
      return msgMgr.sendTemp(sock, from, "⚠️ This command is for groups only.", 5000);
    }

    const sender = msg.key.participant || msg.key.remoteJid;
    const cmdText =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      "";
    const cmd = cmdText.trim().toLowerCase().split(/\s+/)[0].slice(1);

    const adminOk = await isGroupAdmin(sock, from, sender);
    if (!adminOk && !isOwner(sender)) {
      return msgMgr.sendTemp(sock, from, "❌ Admins only.", 4000);
    }

    const mentioned =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0];

    try {
      switch (cmd) {
        case "kick": {
          if (!target)
            return msgMgr.sendTemp(sock, from, "⚠️ Mention a user to kick.", 5000);
          const botId = `${(sock.user?.id || "").split(":")[0]}@s.whatsapp.net`;
          if (target === botId)
            return msgMgr.sendTemp(sock, from, "❌ I cannot kick myself!", 4000);
          await sock.groupParticipantsUpdate(from, [target], "remove");
          await sendReact(sock, from, msg, "✅");
          break;
        }

        case "add": {
          const num = args[0]?.replace(/\D/g, "");
          if (!num)
            return msgMgr.sendTemp(sock, from, "⚠️ Provide a phone number.", 5000);
          try {
            await sock.groupParticipantsUpdate(from, [`${num}@s.whatsapp.net`], "add");
            await sendReact(sock, from, msg, "✅");
          } catch (e) {
            return msgMgr.send(sock, from, {
              text: "❌ Failed to add user. They might have privacy settings blocking this.",
            });
          }
          break;
        }

        case "promote":
          if (!target)
            return msgMgr.sendTemp(sock, from, "⚠️ Mention a user.", 5000);
          await sock.groupParticipantsUpdate(from, [target], "promote");
          await sendReact(sock, from, msg, "✅");
          break;

        case "demote":
          if (!target)
            return msgMgr.sendTemp(sock, from, "⚠️ Mention a user.", 5000);
          await sock.groupParticipantsUpdate(from, [target], "demote");
          await sendReact(sock, from, msg, "✅");
          break;

        case "lock": {
          await sock.groupSettingUpdate(from, "announcement");
          let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
          reply += `│   »»——  sᴇᴄᴜʀɪᴛʏ ᴜᴘᴅᴀᴛᴇ  ——««  │\n`;
          reply += `└────────────────────────────┘\n\n`;
          reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
          reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
          reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
          reply += `  【 ☁️ ɢʀᴏᴜᴘ ᴇᴠᴇɴᴛ 】\n`;
          reply += `  ► Group locked\n`;
          reply += `    ┖ Only admins can send messages.\n\n`;
          reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
          await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
          await sendReact(sock, from, msg, "✅");
          break;
        }

        case "unlock": {
          await sock.groupSettingUpdate(from, "announcement");
          let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
          reply += `│   »»——  sᴇᴄᴜʀɪᴛʏ ᴜᴘᴅᴀᴛᴇ  ——««  │\n`;
          reply += `└────────────────────────────┘\n\n`;
          reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
          reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
          reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
          reply += `  【 ☁️ ɢʀᴏᴜᴘ ᴇᴠᴇɴᴛ 】\n`;
          reply += `  ► Group unlocked\n`;
          reply += `    ┖ All members can send messages.\n\n`;
          reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
          await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
          await sendReact(sock, from, msg, "✅");
          break;
        }

        case "antilink": {
          const val = args[0]?.toLowerCase();
          if (val !== "on" && val !== "off") {
            return msgMgr.sendTemp(sock, from, "⚠️ Use: .antilink on/off", 5000);
          }
          db.update("groups", from, { antilink: val === "on" });
          let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
          reply += `│   »»——  ᴍᴀᴛʀɪx sʜɪᴇʟᴅ  ——««  │\n`;
          reply += `└────────────────────────────┘\n\n`;
          reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
          reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
          reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
          reply += `  【 ☁️ ᴀɴᴛɪ-ʟɪɴᴋ 】\n`;
          reply += `  ► Shield Status\n`;
          reply += `    ┖ ${val.toUpperCase()}\n\n`;
          reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
          await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
          await sendReact(sock, from, msg, "✅");
          break;
        }


        default:
          await msgMgr.sendTemp(sock, from, "❓ Unknown group command.", 5000);
      }
    } catch (err) {
      await msgMgr.sendTemp(sock, from, `❌ Failed: ${err.message?.slice(0, 60)}`, 5000);
      await sendReact(sock, from, msg, "❌");
    }
  },
};
