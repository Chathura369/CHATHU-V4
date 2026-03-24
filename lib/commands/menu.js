"use strict";

const path = require("path");
const { BOT_NAME, PREFIX, OWNER_NUMBER } = require("../../config");
const { sendReact } = require("../utils");
const msgMgr = require("../message-manager");

const LOGO = path.join(__dirname, "../../chathu_md_logo.png");

module.exports = {
  name: "menu",
  aliases: ["help", "allmenu", "commands", "list", "start"],
  description: "Bot command menu",

  async execute(sock, msg, from) {
    await sendReact(sock, from, msg, "📜");

    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);

    const participant = msg.key.participant || msg.key.remoteJid || from;

    // 1. Random Banner System
    const banners = [
      "https://i.ibb.co/6R22M5W/sakura-banner-placeholder-1.jpg",
      "https://i.ibb.co/3sXzPqk/sakura-banner-placeholder-2.jpg",
      "https://i.ibb.co/9vD3j0W/sakura-banner-placeholder-3.jpg"
    ];
    const randomBanner = banners[Math.floor(Math.random() * banners.length)];

    const fullMenu = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐
│   »»——  ᴄᴏᴍᴍᴀɴᴅ ᴍᴇɴᴜ  ——««  │
└────────────────────────────┘

 ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━
 ┃ ⌕ ᴜsᴇʀ   : @${participant.split('@')[0]}
 ┃ ⌕ ᴘʀᴇғɪx : [ ${PREFIX} ]
 ┃ ⌕ ᴜᴘᴛɪᴍᴇ : ${h}h ${m}m
 ╰━━━━━━━━━━━━━━━

  【 ☁️ ᴅᴏᴡɴʟᴏᴀᴅᴇʀs 】
  ► 1. ${PREFIX}yt / ${PREFIX}yta <link>
    ┖ YouTube (video / audio)
  ► 2. ${PREFIX}tt / ${PREFIX}ig / ${PREFIX}fb
    ┖ Smart Social Download
  ► 3. ${PREFIX}play / ${PREFIX}song <name>
    ┖ Music + Lyrics (Pro)

  【 ☁️ ᴀᴅᴜʟᴛ ᴅᴏᴡɴʟᴏᴀᴅs 】
  ► 1. ${PREFIX}ph · ${PREFIX}xnxx · ${PREFIX}xv · ${PREFIX}xh
    ┖ Adult Videos
  ► 2. ${PREFIX}yp · ${PREFIX}sb · ${PREFIX}rt
    ┖ Other Adult Sites

  【 ☁️ sᴇᴀʀᴄʜ 】
  ► 1. ${PREFIX}yts <keyword>
    ┖ YouTube Search
  ► 2. ${PREFIX}g <query> · ${PREFIX}wiki 
    ┖ Web Search
  ► 3. ${PREFIX}ai / ${PREFIX}img
    ┖ AI Assistant / Image Gen

  【 ☁️ ɢʀᴏᴜᴘ ᴄᴏɴᴛʀᴏʟ 】
  ► 1. ${PREFIX}kick · ${PREFIX}add · ${PREFIX}promote
    ┖ Admin Ops
  ► 2. ${PREFIX}lock · ${PREFIX}unlock · ${PREFIX}antilink
    ┖ Security Control
  ► 3. ${PREFIX}welcome · ${PREFIX}goodbye
    ┖ Automation (on/off)

  【 ☁️ ᴀᴜᴛᴏᴍᴀᴛɪᴏɴ & sʏsᴛᴇᴍ 】
  ► 1. ${PREFIX}remind <time> <msg>
    ┖ Timer / Reminder
  ► 2. ${PREFIX}steal / ${PREFIX}ss (reply)
    ┖ Status Stealer
  ► 3. ${PREFIX}alive · ${PREFIX}ping 
    ┖ Status check
  ► 4. ${PREFIX}update / ${PREFIX}reload
    ┖ Maintenance

  【 ☁️ ᴏᴡɴᴇʀ ʜᴀᴄᴋs 】
  ► 1. ${PREFIX}autoview · ${PREFIX}autoreact
    ┖ Status Automation (on/off)
  ► 2. ${PREFIX}ban · ${PREFIX}unban · ${PREFIX}listban
    ┖ Ban management

  【 ☁️ ɢʀᴀᴘʜɪᴄs & sᴛɪᴄᴋᴇʀ 】
  ► 1. ${PREFIX}sticker / ${PREFIX}st / ${PREFIX}s
    ┖ Image/Video to Sticker

  【 ☁️ ᴇᴄᴏɴᴏᴍʏ & ғᴜɴ 】
  ► 1. ${PREFIX}bal · ${PREFIX}daily · ${PREFIX}shop
    ┖ Economy System
  ► 2. ${PREFIX}joke · ${PREFIX}meme · ${PREFIX}fact
    ┖ Fun / Humor
  ► 3. ${PREFIX}boobs · ${PREFIX}ass · ${PREFIX}waifu
    ┖ NSFW Anime (Groups only)
  ► 4. ${PREFIX}nsfw on/off
    ┖ Toggle NSFW Mode

 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;

    try {
      await sock.sendMessage(
        from,
        {
          image: { url: randomBanner },
          caption: fullMenu,
          mentions: [participant],
          contextInfo: {
            isForwarded: true,
            forwardingScore: 999,
          },
        },
        { quoted: msg }
      );
    } catch (e) {
      // Fallback if image fails
      await sock.sendMessage(
        from,
        {
          text: fullMenu,
          mentions: [participant],
          contextInfo: {
            isForwarded: true,
            forwardingScore: 999,
          },
        },
        { quoted: msg }
      );
    }

    await sendReact(sock, from, msg, "✅");
  },
};
