"use strict";

const { sendReact } = require("../utils");
const msgMgr = require("../message-manager");
const db = require("../db");

const DAILY_COINS = 500;
const DAILY_COOLDOWN = 86400000;
const STARTING_COINS = 1000;

const SHOP_ITEMS = [
  { id: "vip", name: "⭐ VIP Badge", price: 5000, desc: "Show off your VIP status" },
  { id: "boost", name: "⚡ XP Boost", price: 2000, desc: "Double XP for 24h" },
  { id: "shield", name: "🛡️ Shield", price: 3000, desc: "Protection from theft" },
];

function getUser(jid) {
  const existing = db.get("users", jid);
  if (existing && existing.coins != null) return existing;
  const fresh = { coins: STARTING_COINS, items: [], lastDaily: 0, xp: 0 };
  db.set("users", jid, fresh);
  return fresh;
}

module.exports = {
  name: "balance",
  aliases: ["daily", "shop", "buy", "transfer", "bal"],
  description: "Virtual economy system",

  async execute(sock, msg, from, args) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const cmdText =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      "";
    const cmd = cmdText.trim().toLowerCase().split(/\s+/)[0].slice(1);

    await sendReact(sock, from, msg, "💰");

    const user = getUser(sender);

    switch (cmd) {
      case "balance":
      case "bal": {
        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ғɪɴᴀɴᴄɪᴀʟ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ ᴀᴄᴄᴏᴜɴᴛ 】\n`;
        reply += `  ► Coins\n`;
        reply += `    ┖ ${user.coins.toLocaleString()}\n`;
        reply += `  ► XP Level\n`;
        reply += `    ┖ ${user.xp || 0}\n`;
        reply += `  ► Assets\n`;
        reply += `    ┖ ${user.items?.length ? user.items.join(", ") : "None"}\n\n`;
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        break;
      }

      case "daily": {
        const now = Date.now();
        if (now - (user.lastDaily || 0) < DAILY_COOLDOWN) {
          const remaining = Math.ceil((user.lastDaily + DAILY_COOLDOWN - now) / 3600000);
          await msgMgr.sendTemp(sock, from, `⏳ Come back in *${remaining}h* for your next daily reward.`, 7000);
          await sendReact(sock, from, msg, "⏳");
          return;
        }
        user.coins += DAILY_COINS;
        user.lastDaily = now;
        db.set("users", sender, user);
        
        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ᴅᴀɪʟʏ ʀᴇᴡᴀʀᴅ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ ᴄʟᴀɪᴍᴇᴅ 】\n`;
        reply += `  ► RECEIVED\n`;
        reply += `    ┖ +${DAILY_COINS} coins\n`;
        reply += `  ► TOTAL BALANCE\n`;
        reply += `    ┖ ${user.coins.toLocaleString()}\n\n`;
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        break;
      }

      case "shop": {
        let shopMsg = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        shopMsg += `│   »»——  ᴘʀᴇᴍɪᴜᴍ sʜᴏᴘ  ——««  │\n`;
        shopMsg += `└────────────────────────────┘\n\n`;
        shopMsg += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        shopMsg += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
        shopMsg += ` ╰━━━━━━━━━━━━━━━\n\n`;
        shopMsg += `  【 ☁️ ɪᴛᴇᴍs ᴄᴀᴛᴀʟᴏɢ 】\n`;
        SHOP_ITEMS.forEach((item) => {
          shopMsg += `  ► ${item.name}\n`;
          shopMsg += `    ┖ Cost: ${item.price} — ${item.desc}\n`;
          shopMsg += `    ┖ Buy: .buy ${item.id}\n`;
        });
        shopMsg += `\n 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: shopMsg, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        break;
      }

      case "buy": {
        const itemId = args[0]?.toLowerCase();
        const item = SHOP_ITEMS.find((i) => i.id === itemId);
        if (!item) {
          return msgMgr.sendTemp(sock, from, `❌ Unknown item. Type .shop to see available items.`, 5000);
        }
        if (user.coins < item.price) {
          return msgMgr.sendTemp(sock, from, `❌ Insufficient coins. You need ${item.price}, you have ${user.coins}.`, 6000);
        }
        user.coins -= item.price;
        user.items = user.items || [];
        if (!user.items.includes(item.id)) user.items.push(item.id);
        db.set("users", sender, user);
        
        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ᴘᴜʀᴄʜᴀsᴇ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ ʀᴇᴄᴇɪᴘᴛ 】\n`;
        reply += `  ► Item Bought\n`;
        reply += `    ┖ ${item.name}\n`;
        reply += `  ► Remaining Coins\n`;
        reply += `    ┖ ${user.coins.toLocaleString()}\n\n`;
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        break;
      }

      case "transfer": {
        const mentioned =
          msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const target = mentioned[0];
        const amount = parseInt(args.find((a) => /^\d+$/.test(a)));
        if (!target || !amount || amount <= 0) {
          return msgMgr.sendTemp(sock, from, "⚠️ Usage: .transfer @user <amount>", 5000);
        }
        if (target === sender) {
          return msgMgr.sendTemp(sock, from, "❌ You cannot transfer to yourself.", 4000);
        }
        if (user.coins < amount) {
          return msgMgr.sendTemp(sock, from, `❌ You only have ${user.coins} coins.`, 5000);
        }
        user.coins -= amount;
        db.set("users", sender, user);
        const targetUser = getUser(target);
        targetUser.coins += amount;
        db.set("users", target, targetUser);
        
        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ғᴜɴᴅ ᴛʀᴀɴsғᴇʀ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ   : @${sender.split('@')[0]}\n`;
        reply += ` ┃ ⌕ ᴛᴀʀɢᴇᴛ : @${target.split('@')[0]}\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ ᴛʀᴀɴsᴀᴄᴛɪᴏɴ 】\n`;
        reply += `  ► Amount Sent\n`;
        reply += `    ┖ ${amount.toLocaleString()} coins\n`;
        reply += `  ► New Balance\n`;
        reply += `    ┖ ${user.coins.toLocaleString()}\n\n`;
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: reply, mentions: [sender, target], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        break;
      }

      default:
        await msgMgr.sendTemp(sock, from, "❓ Unknown economy command.", 4000);
    }

    await sendReact(sock, from, msg, "✅");
  },
};
