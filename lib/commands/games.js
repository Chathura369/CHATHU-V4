"use strict";

const { sendReact } = require("../utils");
const msgMgr = require("../message-manager");
const db = require("../db");

const TRUTH_LIST = [
  "What is your biggest fear?",
  "Have you ever lied to your best friend?",
  "What is the most embarrassing thing you have ever done?",
  "What is your biggest regret in life?",
  "Have you ever had a crush on someone in this group?",
  "What is the worst gift you have ever received?",
  "Have you ever cheated in a test?",
  "What is something you have never told anyone?",
  "When was the last time you cried?",
  "What is your deepest secret?",
];

const DARE_LIST = [
  "Send your most embarrassing photo in the chat.",
  "Change your status to 'I love pickles' for 1 hour.",
  "Do 20 push-ups right now.",
  "Send a message to your crush saying 'hi'.",
  "Speak in rhymes for the next 5 minutes.",
  "Change your profile picture to a funny face for 30 mins.",
  "Text your mom 'I love you' right now.",
  "Eat a spoonful of something weird in your kitchen.",
  "Post a cringe selfie in the group.",
  "Act like a chicken for 1 minute.",
];

const COMPLIMENTS = [
  "You are absolutely amazing! ✨",
  "Your smile could light up an entire room! 😊",
  "You have a heart of gold! 💛",
  "You are stronger than you think! 💪",
  "The world is a better place with you in it! 🌍",
  "You have an incredible sense of humor! 😂",
  "You inspire everyone around you! 🌟",
  "Your kindness is truly contagious! ❤️",
  "You are one in a million! 🏆",
  "Keep being awesome, you're doing great! 🚀",
];

const ROASTS = [
  "I'd agree with you but then we'd both be wrong. 😂",
  "You're not stupid, you just have bad luck thinking. 🤔",
  "If laughter is the best medicine, your face must be curing diseases. 💀",
  "You're the reason they put instructions on shampoo bottles. 😅",
  "I'm jealous of people who haven't met you. 🤣",
  "You bring everyone so much joy when you leave the room. 😜",
  "Your birth certificate is an apology letter from the hospital. 💀",
  "You're like a cloud — when you disappear, it's a beautiful day. ☀️",
  "Even Google can't find your common sense. 🔍",
  "You're proof that even nature makes mistakes. 🌿",
];

const EIGHTBALL_RESPONSES = [
  "It is certain. ✅", "It is decidedly so. ✅", "Without a doubt. ✅",
  "Yes, definitely. ✅", "You may rely on it. ✅", "As I see it, yes. ✅",
  "Most likely. ✅", "Outlook good. ✅", "Yes. ✅", "Signs point to yes. ✅",
  "Reply hazy, try again. ⚠️", "Ask again later. ⚠️",
  "Better not tell you now. ⚠️", "Cannot predict now. ⚠️",
  "Concentrate and ask again. ⚠️",
  "Don't count on it. ❌", "My reply is no. ❌", "My sources say no. ❌",
  "Outlook not so good. ❌", "Very doubtful. ❌",
];

function formatBox(title, body, participant) {
  let r = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
  r += `│   »»——  ${title}  ——««  │\n`;
  r += `└────────────────────────────┘\n\n`;
  if (participant) {
    r += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
    r += ` ┃ ⌕ ᴜsᴇʀ : @${participant.split("@")[0]}\n`;
    r += ` ╰━━━━━━━━━━━━━━━\n\n`;
  }
  r += body;
  r += `\n\n 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;
  return r;
}

const SHIP_EMOJIS = ["💔", "💔", "❤️‍🔥", "💛", "💚", "💙", "💜", "❤️", "💘", "💞", "💯"];

module.exports = {
  name: "8ball",
  aliases: ["truth", "dare", "tord", "compliment", "roast", "ship", "rate", "rps", "lovecalc"],
  description: "Fun games and activities",

  async execute(sock, msg, from, args) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const cmdText =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text || "";
    const cmd = cmdText.trim().toLowerCase().split(/\s+/)[0].slice(1);

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    await sendReact(sock, from, msg, "🎮");

    try {
      switch (cmd) {

        case "8ball": {
          const q = args.join(" ").trim();
          if (!q) return msgMgr.sendTemp(sock, from, "⚠️ Ask me a question! Example: .8ball Will I be rich?", 5000);
          const answer = EIGHTBALL_RESPONSES[Math.floor(Math.random() * EIGHTBALL_RESPONSES.length)];
          const body = `  【 ❓ ǫᴜᴇsᴛɪᴏɴ 】\n  ► ${q}\n\n  【 🎱 ᴀɴsᴡᴇʀ 】\n  ► ${answer}`;
          await sock.sendMessage(from, {
            text: formatBox("  8ʙᴀʟʟ  ", body, sender),
            mentions: [sender],
          }, { quoted: msg });
          break;
        }

        case "truth": {
          const q = TRUTH_LIST[Math.floor(Math.random() * TRUTH_LIST.length)];
          const body = `  【 💬 ᴛʀᴜᴛʜ ǫᴜᴇsᴛɪᴏɴ 】\n  ► ${q}`;
          await sock.sendMessage(from, {
            text: formatBox("  ᴛʀᴜᴛʜ  ", body, sender),
            mentions: [sender],
          }, { quoted: msg });
          break;
        }

        case "dare": {
          const d = DARE_LIST[Math.floor(Math.random() * DARE_LIST.length)];
          const body = `  【 🔥 ᴅᴀʀᴇ ᴄʜᴀʟʟᴇɴɢᴇ 】\n  ► ${d}`;
          await sock.sendMessage(from, {
            text: formatBox("  ᴅᴀʀᴇ  ", body, sender),
            mentions: [sender],
          }, { quoted: msg });
          break;
        }

        case "tord": {
          const choice = Math.random() > 0.5
            ? TRUTH_LIST[Math.floor(Math.random() * TRUTH_LIST.length)]
            : DARE_LIST[Math.floor(Math.random() * DARE_LIST.length)];
          const type = Math.random() > 0.5 ? "🔍 TRUTH" : "🔥 DARE";
          const body = `  【 ${type} 】\n  ► ${choice}`;
          await sock.sendMessage(from, {
            text: formatBox("  ᴛʀᴜᴛʜ ᴏʀ ᴅᴀʀᴇ  ", body, sender),
            mentions: [sender],
          }, { quoted: msg });
          break;
        }

        case "compliment": {
          const target = mentioned[0] || sender;
          const comp = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
          const body = `  【 💌 ᴄᴏᴍᴘʟɪᴍᴇɴᴛ 】\n  ► Hey @${target.split("@")[0]}!\n  ► ${comp}`;
          await sock.sendMessage(from, {
            text: formatBox("  ᴄᴏᴍᴘʟɪᴍᴇɴᴛ  ", body, target),
            mentions: [target],
          }, { quoted: msg });
          break;
        }

        case "roast": {
          const target = mentioned[0] || sender;
          const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
          const body = `  【 🔥 ʀᴏᴀsᴛ 】\n  ► @${target.split("@")[0]}\n  ► ${roast}`;
          await sock.sendMessage(from, {
            text: formatBox("  ʀᴏᴀsᴛ  ", body, target),
            mentions: [target],
          }, { quoted: msg });
          break;
        }

        case "ship": {
          const p1 = mentioned[0] || sender;
          const p2 = mentioned[1] || sender;
          if (p1 === p2) return msgMgr.sendTemp(sock, from, "⚠️ Mention two different users to ship!", 5000);
          const score = Math.floor(Math.random() * 101);
          const emoji = SHIP_EMOJIS[Math.floor(score / 10)];
          const bar = "█".repeat(Math.floor(score / 10)) + "░".repeat(10 - Math.floor(score / 10));
          const body = `  【 💘 sʜɪᴘ ᴄᴀʟᴄᴜʟᴀᴛᴏʀ 】\n  ► @${p1.split("@")[0]} + @${p2.split("@")[0]}\n\n  ► Compatibility: *${score}%* ${emoji}\n  ► [${bar}]`;
          await sock.sendMessage(from, {
            text: formatBox("  sʜɪᴘ  ", body, null),
            mentions: [p1, p2],
          }, { quoted: msg });
          break;
        }

        case "lovecalc":
        case "rate": {
          const target = mentioned[0] || sender;
          const name = args.filter(a => !a.startsWith("@")).join(" ").trim() || target.split("@")[0];
          let hash = 0;
          for (const c of (sender + target)) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
          const score = Math.abs(hash) % 101;
          const hearts = "❤️".repeat(Math.ceil(score / 20));
          const body = `  【 💝 ʟᴏᴠᴇ ᴍᴇᴛᴇʀ 】\n  ► @${target.split("@")[0]}\n  ► Score: *${score}%*\n  ► ${hearts}\n\n  ${score > 70 ? "🔥 Hot match!" : score > 40 ? "💫 Good vibes!" : "💔 Not quite there..."}`;
          await sock.sendMessage(from, {
            text: formatBox("  ʟᴏᴠᴇ ᴄᴀʟᴄ  ", body, sender),
            mentions: [sender, target],
          }, { quoted: msg });
          break;
        }

        case "rps": {
          const choices = ["🪨 Rock", "📄 Paper", "✂️ Scissors"];
          const userChoice = args[0]?.toLowerCase();
          const validChoices = { rock: 0, paper: 1, scissors: 2, r: 0, p: 1, s: 2 };
          if (userChoice === undefined || validChoices[userChoice] === undefined)
            return msgMgr.sendTemp(sock, from, "⚠️ Usage: .rps rock / paper / scissors (or r/p/s)", 5000);
          const uIdx = validChoices[userChoice];
          const bIdx = Math.floor(Math.random() * 3);
          const result = uIdx === bIdx ? "🤝 Draw!" : (uIdx - bIdx + 3) % 3 === 1 ? "🏆 You Win!" : "💀 Bot Wins!";
          const body = `  【 🎮 ʀᴏᴄᴋ-ᴘᴀᴘᴇʀ-sᴄɪssᴏʀs 】\n  ► You : ${choices[uIdx]}\n  ► Bot : ${choices[bIdx]}\n\n  ► Result : *${result}*`;
          await sock.sendMessage(from, {
            text: formatBox("  ʀᴘs ɢᴀᴍᴇ  ", body, sender),
            mentions: [sender],
          }, { quoted: msg });
          break;
        }

        default:
          await msgMgr.sendTemp(sock, from, "❓ Unknown game command.", 4000);
      }

      await sendReact(sock, from, msg, "✅");
    } catch (err) {
      await msgMgr.sendTemp(sock, from, `❌ Error: ${err.message?.slice(0, 60)}`, 5000);
      await sendReact(sock, from, msg, "❌");
    }
  },
};
