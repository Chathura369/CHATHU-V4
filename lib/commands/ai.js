"use strict";

const axios = require("axios");
const googleTTS = require("google-tts-api");
const translate = require("translate-google-api");
const { sendReact, presenceUpdate, truncate } = require("../utils");
const msgMgr = require("../message-manager");
const { handleAPIError, retryWithBackoff, safeExecute } = require("../error-handler");
const { isValidSearchQuery } = require("../validator");
const rateLimiter = require("../rate-limiter");
const { logger } = require("../../logger");

module.exports = {
  name: "ai",
  aliases: ["chat", "tts", "trt", "translate", "img"],
  description: "AI chat, TTS, translation, and image generation",

  async execute(sock, msg, from, args) {
    try {
      const cmdText =
        msg?.message?.conversation ||
        msg?.message?.extendedTextMessage?.text ||
        "";
      const command =
        cmdText.trim().toLowerCase().split(/\s+/)[0].slice(1) || "ai";
      const q = args?.join(" ").trim() || "";

      if (!q || !isValidSearchQuery(q, 500)) {
        return msgMgr.sendTemp(sock, from, "⚠️ Please provide some input.", 5000);
      }

      const sender = msg.key.participant || msg.key.remoteJid;
      const rl = rateLimiter.trackRateLimit(sender, "ai", 3, 60000);
      if (!rl.ok)
        return msgMgr.sendTemp(
          sock,
          from,
          `⏳ Slow down! Wait ${Math.ceil(rl.retryAfter / 1000)}s`,
          4000,
        );

      await sendReact(sock, from, msg, "🤖");
      await presenceUpdate(sock, from, command === "tts" ? "recording" : "composing");

      if (["ai", "chat"].includes(command)) {
        const result = await safeExecute(async () => {
          const data = await retryWithBackoff(
            async () => {
              const { data } = await axios.get(
                `https://aivolve-api.vercel.app/api/chat?prompt=${encodeURIComponent(q)}`,
                { timeout: 12000 },
              );
              if (!data?.response) throw new Error("Empty response");
              return data;
            },
            { maxAttempts: 2, delayMs: 1500, context: "AIChat", throwOnFail: true },
          );
          return data.response;
        }, "AIChat");

        if (!result) {
          await msgMgr.sendTemp(sock, from, "❌ AI service unavailable. Try again.", 6000);
          await sendReact(sock, from, msg, "❌");
          return;
        }

        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ᴀɪ ᴄʜᴀᴛ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ ᴀɪᴠᴏʟᴠᴇ ʀᴇsᴘᴏɴsᴇ 】\n`;
        reply += `  ► ${truncate(result, 3500)}\n\n`;
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        await sendReact(sock, from, msg, "✅");
        return;
      }

      if (command === "tts") {
        let audioUrl;
        try {
          audioUrl = googleTTS.getAudioUrl(q, {
            lang: "en",
            slow: false,
            host: "https://translate.google.com",
          });
          if (!audioUrl) throw new Error("No audio URL");
        } catch {
          logger("[AI] Google TTS unavailable, skipping");
        }

        if (!audioUrl) {
          await msgMgr.sendTemp(sock, from, "❌ Text-to-speech service is unavailable.", 6000);
          await sendReact(sock, from, msg, "❌");
          return;
        }

        await sock.sendMessage(from, {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          ptt: true,
        }, { quoted: msg });
        await sendReact(sock, from, msg, "✅");
        return;
      }

      if (["trt", "translate"].includes(command)) {
        const translated = await safeExecute(async () => {
          return retryWithBackoff(
            async () => {
              try {
                const r = await translate(q, { to: "si" });
                return Array.isArray(r) ? r[0] : r;
              } catch {
                const r = await translate(q, { to: "en" });
                return Array.isArray(r) ? r[0] : r;
              }
            },
            { maxAttempts: 2, delayMs: 1000, context: "Translation", throwOnFail: true },
          );
        }, "Translation");

        if (!translated) {
          await msgMgr.sendTemp(sock, from, "❌ Translation failed.", 6000);
          await sendReact(sock, from, msg, "❌");
          return;
        }

        let reply = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        reply += `│   »»——  ᴛʀᴀɴsʟᴀᴛɪᴏɴ  ——««  │\n`;
        reply += `└────────────────────────────┘\n\n`;
        reply += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        reply += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
        reply += ` ╰━━━━━━━━━━━━━━━\n\n`;
        reply += `  【 ☁️ ɢᴏᴏɢʟᴇ ᴛʀᴀɴsʟᴀᴛᴇ 】\n`;
        reply += `  ► ${truncate(translated, 3000)}\n\n`;
        reply += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        await sock.sendMessage(from, { text: reply, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 999 } }, { quoted: msg });
        await sendReact(sock, from, msg, "✅");
        return;
      }

      if (command === "img") {
        const imgUrl = `https://aivolve-api.vercel.app/api/image?prompt=${encodeURIComponent(q)}`;
        const ok = await safeExecute(async () => {
          const res = await axios.head(imgUrl, { timeout: 8000 });
          return res.status === 200;
        }, "AIImage");

        if (!ok) {
          await msgMgr.sendTemp(sock, from, "❌ Image generation service unavailable.", 6000);
          await sendReact(sock, from, msg, "❌");
          return;
        }

        let caption = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
        caption += `│   »»——  ᴀɪ ɪᴍᴀɢᴇ  ——««  │\n`;
        caption += `└────────────────────────────┘\n\n`;
        caption += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
        caption += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
        caption += ` ╰━━━━━━━━━━━━━━━\n\n`;
        caption += `  【 ☁️ ᴀɪᴠᴏʟᴠᴇ sᴛᴜᴅɪᴏ 】\n`;
        caption += `  ► Prompt: ${truncate(q, 50)}\n\n`;
        caption += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
        await sock.sendMessage(from, {
          image: { url: imgUrl },
          caption: caption,
          mentions: [sender],
          contextInfo: { isForwarded: true, forwardingScore: 999 }
        }, { quoted: msg });
        await sendReact(sock, from, msg, "✅");
        return;
      }

      await sendReact(sock, from, msg, "❓");
      await msgMgr.sendTemp(sock, from, "❓ Unknown AI command.", 5000);
    } catch (err) {
      await sendReact(sock, from, msg, "❌");
      const fe = handleAPIError(err, "AI");
      await msgMgr.sendTemp(sock, from, `❌ ${fe.message}`, 7000);
    }
  },
};
