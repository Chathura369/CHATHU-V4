"use strict";

const axios = require("axios");
const { searchYouTube, searchAdultSite } = require("../search");
const { sendReact, presenceUpdate, truncate } = require("../utils");
const { storeSearchResults } = require("../handler");
const { handleAPIError, retryWithBackoff } = require("../error-handler");
const { isValidSearchQuery } = require("../validator");
const rateLimiter = require("../rate-limiter");
const msgMgr = require("../message-manager");

const NUM_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

const ADULT_SITE_MAP = {
  phsearch: "Pornhub",
  xvsearch: "XVideos",
  xhsearch: "xHamster",
  ypsearch: "YouPorn",
  sbsearch: "SpankBang",
  rtsearch: "RedTube",
};

function formatList(results, query, emoji, label, sender) {
  let msg = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
  msg += `│   »»——  ${label.toUpperCase()}  ——««  │\n`;
  msg += `└────────────────────────────┘\n\n`;
  msg += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
  msg += ` ┃ ⌕ ᴜsᴇʀ  : @${sender.split('@')[0]}\n`;
  msg += ` ┃ ⌕ ǫᴜᴇʀʏ : "${truncate(query, 30)}"\n`;
  msg += ` ╰━━━━━━━━━━━━━━━\n\n`;
  msg += `  【 ☁️ sᴇᴀʀᴄʜ ʀᴇsᴜʟᴛs 】\n`;
  results.forEach((v, i) => {
    msg += `  ► ${i + 1}. ${truncate(v.title, 40)}\n`;
    msg += `    ┖ Duration: ${v.duration || "?"}\n`;
  });
  msg += `\n  【 ☁️ ᴀᴄᴛɪᴏɴ 】\n`;
  msg += `  ► 👉 Reply 1–${results.length} to download\n\n`;
  msg += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
  return msg;
}

module.exports = {
  name: "search",
  aliases: ["yts", "g", "wiki", "reddit", "pinsearch", ...Object.keys(ADULT_SITE_MAP)],
  description: "Multi-site search engine",

  async execute(sock, msg, from, args) {
    const q = args?.join(" ").trim() || "";
    if (!isValidSearchQuery(q)) {
      return msgMgr.sendTemp(sock, from, "🔍 Please provide a search keyword.", 5000);
    }

    const sender = msg?.key?.participant || msg?.key?.remoteJid;
    const limit = rateLimiter.check(sender, "search", 5);
    if (!limit.allowed) {
      return msgMgr.sendTemp(sock, from, `⏳ Too many searches. Wait ${limit.resetIn}s.`, 5000);
    }

    const cmdText =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      "";
    const command =
      cmdText.trim().toLowerCase().split(/\s+/)[0].slice(1) || "yts";

    sendReact(sock, from, msg, "🔍");
    presenceUpdate(sock, from, "composing");

    try {
      if (command === "yts") {
        const results = await retryWithBackoff(() => searchYouTube(q, 10), {
          maxAttempts: 2,
          delayMs: 1000,
          throwOnFail: false,
          fallback: [],
        });
        if (!results.length) {
          return msgMgr.sendTemp(sock, from, `❌ No YouTube results for "${q}".`, 6000);
        }
        await sock.sendMessage(from, { text: formatList(results, q, "▶️", "YouTube Search", sender), mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        storeSearchResults(msg?.key?.id, sender, results);
        await sendReact(sock, from, msg, "✅");
        return;
      }

      const adultSite = ADULT_SITE_MAP[command];
      if (adultSite) {
        const results = await retryWithBackoff(
          () => searchAdultSite(adultSite, q, 10),
          { maxAttempts: 2, delayMs: 1000, throwOnFail: false, fallback: [] },
        );
        if (!results.length) {
          return msgMgr.sendTemp(sock, from, `🔞 No *${adultSite}* results for "${q}". Try again shortly.`, 7000);
        }
        await sock.sendMessage(from, { text: formatList(results, q, "🔞", `${adultSite} Search`, sender), mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        storeSearchResults(msg?.key?.id, sender, results);
        await sendReact(sock, from, msg, "✅");
        return;
      }

      if (command === "g") {
        const { data } = await axios.get(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`,
          { timeout: 8000 },
        );
        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ᴅᴜᴄᴋᴅᴜᴄᴋɢᴏ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ  : @${sender.split('@')[0]}\n`;
        reply += ` ┃ ⌕ ǫᴜᴇʀʏ : "${truncate(q, 40)}"\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ sᴇᴀʀᴄʜ ʀᴇsᴜʟᴛ 】\n`;
        if (data?.AbstractText) {
          reply += `  ► Summary\n`;
          reply += `    ┖ ${truncate(data.AbstractText, 400)}\n\n`;
        }
        const topics = (data?.RelatedTopics || []).slice(0, 5);
        if (topics.length > 0) {
          reply += `  【 ☁️ ʀᴇʟᴀᴛᴇᴅ ᴛᴏᴘɪᴄs 】\n`;
          topics.forEach((r, i) => {
            if (r?.Text) reply += `  ► ${i + 1}. ${truncate(r.Text, 80)}\n`;
          });
          reply += `\n`;
        }
        if (!data?.AbstractText) reply += `  ► No instant answer\n    ┖ Try .wiki ${q}\n\n`;
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        await sendReact(sock, from, msg, "✅");
        return;
      }

      if (command === "wiki") {
        const { data } = await axios.get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`,
          { timeout: 8000 },
        );
        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ᴡɪᴋɪᴘᴇᴅɪᴀ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ  : @${sender.split('@')[0]}\n`;
        reply += ` ┃ ⌕ ᴛᴏᴘɪᴄ : ${truncate(data.title, 60)}\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ sᴜᴍᴍᴀʀʏ 】\n`;
        reply += `  ► ${truncate(data.extract, 600)}\n\n`;
        if (data?.content_urls?.desktop?.page) {
           reply += `  ► Link:\n    ┖ ${data.content_urls.desktop.page}\n\n`;
        }
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        await sendReact(sock, from, msg, "✅");
        return;
      }

      if (command === "reddit") {
        const { data } = await axios.get(
          `https://www.reddit.com/r/${encodeURIComponent(q)}/hot.json?limit=8`,
          { headers: { "User-Agent": "ChathuMDBot/3.0" }, timeout: 8000 },
        );
        const posts = (data?.data?.children || []).map((p) => p.data).filter(Boolean);
        if (!posts.length) {
          return msgMgr.sendTemp(sock, from, `❌ No posts in r/${q}.`, 5000);
        }
        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ʀᴇᴅᴅɪᴛ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ  : @${sender.split('@')[0]}\n`;
        reply += ` ┃ ⌕ sᴜʙʀᴇᴅ : r/${truncate(q, 30)}\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ ʜᴏᴛ ᴘᴏsᴛs 】\n`;
        posts.slice(0, 8).forEach((p, i) => {
          reply += `  ► ${i + 1}. ${truncate(p.title, 55)}\n`;
          reply += `    ┖ 👍 ${p.ups || 0} | 💬 ${p.num_comments || 0}\n`;
        });
        reply += `\n 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        await sendReact(sock, from, msg, "✅");
        return;
      }

      if (command === "pinsearch") {
        const link = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`;
        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ᴘɪɴᴛᴇʀᴇsᴛ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ  : @${sender.split('@')[0]}\n`;
        reply += ` ┃ ⌕ ǫᴜᴇʀʏ : "${truncate(q, 40)}"\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ sᴇᴀʀᴄʜ ʀᴇsᴜʟᴛ 】\n`;
        reply += `  ► Link: ${link}\n`;
        reply += `    ┖ Open in browser\n\n`;
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        await sendReact(sock, from, msg, "✅");
        return;
      }
    } catch (err) {
      await sendReact(sock, from, msg, "❌");
      const fe = handleAPIError(err, "Search");
      await msgMgr.sendTemp(sock, from, `❌ ${fe.message}`, 7000);
    }
  },
};
