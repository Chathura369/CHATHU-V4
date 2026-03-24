"use strict";

const fs = require("fs");
const path = require("path");
const { logger } = require("../logger");
const { MemoryCache } = require("./memory-cache");
const { handleAPIError, safeExecute } = require("./error-handler");
const { getMetadata, downloadAndSend } = require("./download-manager");
const msgMgr = require("./message-manager");
const { sendReact, presenceUpdate, truncate, isOwner } = require("./utils");
const { BOT_NAME, PREFIX, WORK_MODE } = require("../config");
const db = require("./db");

const commands = new Map();

const searchResults = new MemoryCache(600000);
const lastSearch = new MemoryCache(600000);
const qualitySelection = new MemoryCache(300000);
const playSelection = new MemoryCache(300000);

function loadCommands() {
  const dir = path.join(__dirname, "commands");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    try {
      const cmdPath = path.join(dir, file);
      delete require.cache[require.resolve(cmdPath)];
      const cmdModule = require(cmdPath);
      const cmds = Array.isArray(cmdModule) ? cmdModule : [cmdModule];

      for (const cmd of cmds) {
        if (!cmd.name || typeof cmd.execute !== "function") continue;
        commands.set(cmd.name, cmd);
        (cmd.aliases || []).forEach((a) => commands.set(a, cmd));
      }
    } catch (err) {
      logger(`[Handler] Failed to load ${file}: ${err.message}`);
    }
  }
  logger(`[Handler] Loaded ${commands.size} commands`);
}

function storeSearchResults(msgId, sender, results) {
  if (!msgId || !sender || !Array.isArray(results)) return;
  const entry = { results, sender };
  searchResults.set(`${sender}:${msgId}`, entry, 600000);
  lastSearch.set(sender, { results, msgId }, 600000);
}

async function showQualityMenu(sock, from, meta, sender) {
  if (!sock || !from || !meta) return;

  qualitySelection.set(sender, { meta }, 300000);

  const sizeStr = meta.filesize
    ? `${(meta.filesize / (1024 * 1024)).toFixed(1)} MB`
    : "Calculating…";

  let menuText = `┌── ⋆⋅☆⋅⋆ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ⋆⋅☆⋅⋆ ──┐\n`;
  menuText += `│   »»——  ᴠɪᴅᴇᴏ ʀᴇᴀᴅʏ  ——««  │\n`;
  menuText += `└────────────────────────────┘\n\n`;
  menuText += ` ╭━━ ❨ 👤 ᴘʀᴏғɪʟᴇ ❩ ━━\n`;
  menuText += ` ┃ ⌕ ᴜsᴇʀ : @${sender.split('@')[0]}\n`;
  menuText += ` ╰━━━━━━━━━━━━━━━\n\n`;
  menuText += `  【 ☁️ ᴅᴇᴛᴀɪʟs 】\n`;
  menuText += `  ► Title     : ${truncate(meta.title, 45)}\n`;
  menuText += `  ► Duration  : ${meta.duration || "?"}\n`;
  menuText += `  ► Size      : ${sizeStr}\n\n`;
  menuText += `  【 📥 ᴅᴏᴡɴʟᴏᴀᴅ ᴏᴘᴛɪᴏɴs 】\n`;
  menuText += `  ► 1️⃣ Reply *1* for HD Video 🎬\n`;
  menuText += `  ► 2️⃣ Reply *2* for SD Video 📱\n`;
  menuText += `  ► 3️⃣ Reply *3* for Audio Only 🎵\n`;
  menuText += `  ► 4️⃣ Reply *4* for Video Document 📁\n\n`;
  menuText += ` 🌸 ⋆｡°✩ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 ✩°｡⋆ 🌸`;

  const buttons = [
    {
      buttonId: `${PREFIX}yt hd ${meta.url}`,
      buttonText: { displayText: "1️⃣ HD" },
      type: 1,
    },
    {
      buttonId: `${PREFIX}yt sd ${meta.url}`,
      buttonText: { displayText: "2️⃣ SD" },
      type: 1,
    },
    {
      buttonId: `${PREFIX}yta ${meta.url}`,
      buttonText: { displayText: "3️⃣ Audio" },
      type: 1,
    },
  ];

  const content = {
    buttons,
    footer: `⚡ ${BOT_NAME} Downloader`,
  };

  if (meta.thumbnail) {
    content.image = { url: meta.thumbnail };
    content.caption = menuText;
  } else {
    content.text = menuText;
  }

  const sent = await msgMgr.send(sock, from, content);
  if (!sent) {
    await msgMgr.send(sock, from, { text: menuText });
  }
}

function storePlaySelection(sender, video) {
  if (!sender || !video) return;
  playSelection.set(sender, { video }, 300000);
}

async function handleCommand(sock, msg, from, text) {
  if (!msg?.key || !from) return false;

  // Auto-Status Hack (Pro Feature)
  if (from === "status@broadcast") {
    const autoView = db.getSetting("auto_view_status") !== false;
    const autoReact = db.getSetting("auto_react_status") === true;

    if (autoView) {
      await sock.readMessages([msg.key]);
    }
    if (autoReact) {
      const reactions = ["🔥", "❤️", "😂", "💯", "✨", "🚀"];
      const emoji = reactions[Math.floor(Math.random() * reactions.length)];
      await sock.sendMessage(from, { react: { text: emoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
    }
    return true;
  }

  try {
    let sender = msg.key.participant || msg.key.remoteJid;
    if (sender?.includes(":")) {
      sender =
        sender.split(":")[0] +
        (sender.endsWith("@s.whatsapp.net") ? "@s.whatsapp.net" : "");

      if (msg.key.participant) msg.key.participant = sender;
      else if (msg.key.remoteJid?.endsWith("@s.whatsapp.net"))
        msg.key.remoteJid = sender;
    }

    const listResp = msg.message?.listResponseMessage;
    const rowId = listResp?.singleSelectReply?.selectedRowId;
    if (rowId?.startsWith("pick:")) {
      const idx = parseInt(rowId.replace("pick:", ""), 10);
      const entry = lastSearch.get(sender);
      if (entry && !isNaN(idx) && entry.results?.[idx]) {
        const meta =
          (await safeExecute(
            () => getMetadata(entry.results[idx].url),
            "GetMetadata",
          )) || entry.results[idx];
        await showQualityMenu(sock, from, meta, sender);
        return true;
      }
    }

    if (!text) {
      const btnResp =
        msg.message?.buttonsResponseMessage ||
        msg.message?.templateButtonReplyMessage;
      const btnId = btnResp?.selectedButtonId || btnResp?.selectedId;
      if (btnId) {
        return await handleCommand(sock, msg, from, btnId);
      }
    }

    const cmdText =
      text ||
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    if (!cmdText) return false;

    const lower = cmdText.trim().toLowerCase();

    if (/^\d+$/.test(lower)) {
      const num = parseInt(lower, 10);
      const idx = num - 1;

      logger(`[Handler] Captured numeric reply: ${num} from ${sender}`);

      // --- [START] SECURE REPLY HANDLER ---
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (quotedMsg) {
        const quotedText = quotedMsg.conversation ||
          quotedMsg.extendedTextMessage?.text ||
          quotedMsg.imageMessage?.caption ||
          quotedMsg.videoMessage?.caption ||
          "";

        // 1. Quality Selection Menu Menu Authentication
        if ((quotedText.includes('VIDEO READY') || quotedText.includes('ᴠɪᴅᴇᴏ ʀᴇᴀᴅʏ')) && quotedText.includes('Reply')) {
          const qEntry = qualitySelection.get(sender);
          if (qEntry) {
            if (num >= 1 && num <= 4) {
              const { meta } = qEntry;
              sendReact(sock, from, msg, "⏳");
              presenceUpdate(sock, from, num === 3 ? "recording" : "composing");
              try {
                const isAudio = num === 3;
                const isDoc = num === 4;
                const isGif = false;
                const quality = num === 1 ? "hd" : "sd";
                await downloadAndSend(sock, from, meta.url, meta.source || "Media", quality, isAudio, false, isDoc, isGif);
                await sendReact(sock, from, msg, "✅");
                qualitySelection.delete(sender);
              } catch (err) {
                const fe = handleAPIError(err, "QualityDownload");
                await msgMgr.sendTemp(sock, from, `❌ ${fe.message}`, 5000);
                await sendReact(sock, from, msg, "❌");
              }
            } else {
              await sock.sendMessage(from, { text: "❌ Invalid selection. Please reply with 1-4." }, { quoted: msg });
            }
          } else {
            await msgMgr.sendTemp(sock, from, "⚠️ Your session has expired. Please search again.", 5000);
            await sendReact(sock, from, msg, "❌");
          }
          return true;
        }

        // 1.5 Play Command Confirmation Authentication
        if ((quotedText.includes('MUSIC PLAYER') || quotedText.includes('ᴍᴜsɪᴄ ᴘʟᴀʏᴇʀ')) && quotedText.includes('Reply')) {
          const pEntry = playSelection.get(sender);
          if (pEntry) {
            if (num >= 1 && num <= 4) {
              const { video } = pEntry;
              const isAudio = num !== 4;
              const isPTT = num === 2;
              const isDoc = num === 3;
              const label = isPTT ? "Voice Note" : isDoc ? "Document" : isAudio ? "Audio" : "Video";

              sendReact(sock, from, msg, "⏳");
              presenceUpdate(sock, from, isAudio ? "recording" : "composing");
              try {
                await downloadAndSend(sock, from, video.url, "YouTube Music", "sd", isAudio, isPTT, isDoc);
                await sendReact(sock, from, msg, "✅");
                playSelection.delete(sender);
              } catch (err) {
                const fe = handleAPIError(err, `PlayDownload(${label})`);
                await msgMgr.sendTemp(sock, from, `❌ ${fe.message}`, 5000);
                await sendReact(sock, from, msg, "❌");
              }
            } else {
              await sock.sendMessage(from, { text: "❌ Invalid selection. Please reply with 1-4." }, { quoted: msg });
            }
          } else {
            await msgMgr.sendTemp(sock, from, "⚠️ Your session has expired. Please search again.", 5000);
            await sendReact(sock, from, msg, "❌");
          }
          return true;
        }
        if ((quotedText.includes('ACTION') || quotedText.includes('ᴀᴄᴛɪᴏɴ')) && quotedText.includes('Reply 1')) {
          const ctxId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
          const key = ctxId ? `${sender}:${ctxId}` : null;
          const entry = (key && searchResults.get(key)) || lastSearch.get(sender);

          if (entry) {
            // 4. Execution Block: Parse the number safely
            const selection = parseInt(lower, 10);

            if (selection >= 1 && selection <= entry.results.length) {
              const idx = selection - 1;
              sendReact(sock, from, msg, "🎬");
              const meta =
                (await safeExecute(
                  () => getMetadata(entry.results[idx].url),
                  "GetMetadataFromSearch",
                )) || entry.results[idx];
              await showQualityMenu(sock, from, meta, sender);
            } else {
              // Handle out-of-bounds numbers
              await sock.sendMessage(from, { text: `❌ Invalid selection. Please reply with a valid number from 1 to ${entry.results.length}.` }, { quoted: msg });
            }
          }
          // 5. Exit Strategy
          return true;
        }
      }


      // --- [END] SECURE REPLY HANDLER ---
    }

    if (cmdText.startsWith(PREFIX + "mode")) {
      if (!msg.key.fromMe && !isOwner(sender)) return false;
      const newMode = cmdText.split(/\s+/)[1]?.toLowerCase();
      if (["public", "private", "self"].includes(newMode)) {
        db.setSetting("work_mode", newMode);
        await msgMgr.send(sock, from, {
          text: `✅ Work mode changed to: *${newMode.toUpperCase()}*`,
        });
        return true;
      } else {
        await msgMgr.sendTemp(
          sock,
          from,
          `⚠️ Usage: .mode [public|private|self]`,
          5000,
        );
        return true;
      }
    }

    if (!cmdText.startsWith(PREFIX)) return false;

    const workMode = db.getSetting("work_mode") || WORK_MODE;
    const isSelf = msg.key.fromMe || isOwner(sender);
    if (!isSelf) {
      if (workMode === "self") return false;
      if (workMode === "private" && from.endsWith("@g.us")) return false;
    }

    const args = cmdText.slice(PREFIX.length).trim().split(/\s+/);
    const name = args.shift()?.toLowerCase();
    if (!name) return false;

    const cmd = commands.get(name);
    if (!cmd) {
      logger(`[Handler] Command not found: ${name}`);
      return false;
    }

    logger(`[Handler] Executing: ${name} (from: ${from})`);
    try {
      await cmd.execute(sock, msg, from, args);
    } catch (err) {
      logger(`[Command/${name}] ${err.message}`);
      await msgMgr.sendTemp(
        sock,
        from,
        "❌ Command error. Please try again.",
        4000,
      );
    }
    return true;
  } catch (err) {
    logger(`[Handler] Unexpected: ${err.message}`);
    return false;
  }
}

async function onGroupUpdate(sock, { id, participants, action }) {
  if (!sock || !id || !participants) return;
  const groupData = db.get("groups", id) || {};
  if (!groupData.welcome && !groupData.goodbye) return;

  for (const participant of participants) {
    try {
      const groupMeta = await sock.groupMetadata(id);
      const groupName = groupMeta.subject;
      const userJid = participant;
      let ppUrl;
      try {
        ppUrl = await sock.profilePictureUrl(userJid, "image");
      } catch {
        ppUrl = "https://i.ibb.co/6R0D0kP/user.jpg";
      }

      if (action === "add" && groupData.welcome) {
        let welcomeMsg = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
        welcomeMsg += `┃   🚀 𝕎𝔼𝕃ℂ𝕆𝕄𝔼 𝕋𝕆 𝔾ℝ𝕆𝕌ℙ 🚀   ┃\n`;
        welcomeMsg += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
        welcomeMsg += `  ⚡ ᴘʀᴏғɪʟᴇ : @${userJid.split("@")[0]}\n`;
        welcomeMsg += `  ⚡ ɢʀᴏᴜᴘ   : ${groupName}\n`;
        welcomeMsg += `  ────────────────────────────\n`;
        welcomeMsg += `  『 📜 ᴅᴇsᴄʀɪᴘᴛɪᴏɴ 』\n`;
        welcomeMsg += `  Welcome to our community! Make sure to read the rules and stay active.\n\n`;
        welcomeMsg += `  👾 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 👾`;

        await sock.sendMessage(id, {
          image: { url: ppUrl },
          caption: welcomeMsg,
          mentions: [userJid],
          contextInfo: { isForwarded: true, forwardingScore: 999 }
        });
      } else if (action === "remove" && groupData.goodbye) {
        let goodbyeMsg = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
        goodbyeMsg += `┃   👋 𝔾𝕆𝕆𝔻𝔹𝕐𝔼 𝔽ℝ𝕀𝔼ℕ𝔻 👋    ┃\n`;
        goodbyeMsg += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
        goodbyeMsg += `  ⚡ ᴜsᴇʀ  : @${userJid.split("@")[0]}\n`;
        goodbyeMsg += `  ────────────────────────────\n`;
        goodbyeMsg += `  『 📜 ᴍᴇssᴀɢᴇ 』\n`;
        goodbyeMsg += `  Farewell! We hope to see you again soon.\n\n`;
        goodbyeMsg += `  👾 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐂𝐇𝐀𝐓𝐇𝐔 𝐌𝐃 👾`;

        await sock.sendMessage(id, {
          image: { url: ppUrl },
          caption: goodbyeMsg,
          mentions: [userJid],
          contextInfo: { isForwarded: true, forwardingScore: 999 }
        });
      }
    } catch (err) {
      logger(`[Handler/GroupUpdate] ${err.message}`);
    }
  }
}

module.exports = {
  loadCommands,
  handleCommand,
  storeSearchResults,
  showQualityMenu,
  storePlaySelection,
  onGroupUpdate,
};
