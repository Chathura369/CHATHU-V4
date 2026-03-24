"use strict";

const { sendReact, isOwner } = require("../utils");
const msgMgr = require("../message-manager");
const { BOT_NAME, PREFIX } = require("../../config");
const db = require("../db");

module.exports = {
  name: "profile",
  aliases: ["pp", "bio", "setbio", "setname", "myinfo", "vcard"],
  description: "Profile tools — view profile pic, bio, and bot info",

  async execute(sock, msg, from, args) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const cmdText =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text || "";
    const cmd = cmdText.trim().toLowerCase().split(/\s+/)[0].slice(1);

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || sender;

    await sendReact(sock, from, msg, "👤");

    try {
      switch (cmd) {

        case "profile":
        case "myinfo": {
          const userData = db.get("users", target) || {};
          let ppUrl;
          try {
            ppUrl = await sock.profilePictureUrl(target, "image");
          } catch {
            ppUrl = null;
          }

          const user = db.get("users", target) || {};
          const uptime = process.uptime();
          const h = Math.floor(uptime / 3600);
          const m = Math.floor((uptime % 3600) / 60);

          let info = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
          info += `│   »»——  ᴘʀᴏғɪʟᴇ ᴄᴀʀᴅ  ——««  │\n`;
          info += `└────────────────────────────┘\n\n`;
          info += `  【 👤 ᴜsᴇʀ ᴅᴇᴛᴀɪʟs 】\n`;
          info += `  ► Name   : ${user.pushName || "Unknown"}\n`;
          info += `  ► Number : ${target.split("@")[0]}\n`;
          info += `  ► Bio    : ${user.bio || "No bio set"}\n`;
          info += `  ► Coins  : ${user.coins ?? 1000}\n`;
          info += `  ► XP     : ${user.xp || 0}\n`;
          info += `  ► Items  : ${user.items?.length ? user.items.join(", ") : "None"}\n`;
          if (isOwner(target)) info += `  ► Role   : 👑 Owner\n`;
          info += `\n  【 🤖 ʙᴏᴛ ɪɴғᴏ 】\n`;
          info += `  ► Bot    : ${BOT_NAME}\n`;
          info += `  ► Uptime : ${h}h ${m}m\n`;
          info += `  ► Prefix : ${PREFIX}\n`;
          info += `\n 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;

          const content = ppUrl
            ? { image: { url: ppUrl }, caption: info, mentions: [target] }
            : { text: info, mentions: [target] };

          await sock.sendMessage(from, content, { quoted: msg });
          await sendReact(sock, from, msg, "✅");
          break;
        }

        case "pp": {
          let ppTarget = target;
          let ppUrl;
          try {
            ppUrl = await sock.profilePictureUrl(ppTarget, "image");
          } catch {
            return msgMgr.sendTemp(sock, from, "❌ Could not fetch profile picture. User may have privacy settings on.", 5000);
          }
          let caption = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
          caption += `│   »»——  ᴘʀᴏғɪʟᴇ ᴘɪᴄ  ——««  │\n`;
          caption += `└────────────────────────────┘\n\n`;
          caption += `  ► User : @${ppTarget.split("@")[0]}\n\n`;
          caption += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
          await sock.sendMessage(from, { image: { url: ppUrl }, caption, mentions: [ppTarget] }, { quoted: msg });
          await sendReact(sock, from, msg, "✅");
          break;
        }

        case "bio":
        case "setbio": {
          const text = args.join(" ").trim();
          if (!text) {
            const currentBio = db.get("users", sender)?.bio || "No bio set";
            return msgMgr.send(sock, from, {
              text: `📝 *Your Bio:* ${currentBio}\n\nTo update: *.bio <your new bio>*`,
            });
          }
          if (text.length > 100)
            return msgMgr.sendTemp(sock, from, "❌ Bio must be under 100 characters.", 5000);
          db.update("users", sender, { bio: text });
          await msgMgr.send(sock, from, { text: `✅ Bio updated to: _${text}_` });
          await sendReact(sock, from, msg, "✅");
          break;
        }

        case "setname": {
          if (!isOwner(sender))
            return msgMgr.sendTemp(sock, from, "❌ Owner only.", 4000);
          const name = args.join(" ").trim();
          if (!name)
            return msgMgr.sendTemp(sock, from, "⚠️ Usage: .setname <new name>", 5000);
          await sock.updateProfileName(name);
          await msgMgr.send(sock, from, { text: `✅ Bot name updated to: *${name}*` });
          await sendReact(sock, from, msg, "✅");
          break;
        }

        case "vcard": {
          if (!target || target === sender)
            return msgMgr.sendTemp(sock, from, "⚠️ Mention a user to generate vCard.", 5000);
          const num = target.split("@")[0];
          const ud = db.get("users", target) || {};
          await sock.sendMessage(from, {
            contacts: {
              displayName: ud.pushName || `+${num}`,
              contacts: [{
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${ud.pushName || "Contact"}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD`,
              }],
            },
          }, { quoted: msg });
          await sendReact(sock, from, msg, "✅");
          break;
        }

        default:
          await msgMgr.sendTemp(sock, from, "❓ Unknown profile command.", 4000);
      }
    } catch (err) {
      await msgMgr.sendTemp(sock, from, `❌ Error: ${err.message?.slice(0, 60)}`, 5000);
      await sendReact(sock, from, msg, "❌");
    }
  },
};
