"use strict";

const db = require("../db");
const appState = require("../../state");
const msgMgr = require("../message-manager");
const themeMgr = require("../theme-manager");

module.exports = {
  name: "aiauto",
  aliases: ["ai-auto", "autoai"],
  description: "Toggle AI Auto Reply, set persona, language, voice and memory",
  category: "settings",

  async execute(sock, msg, from, args, name, context) {
    const sender = msg.key.participant || msg.key.remoteJid || from;
    const isOwner = context.isOwner || false;
    const cmd = args[0]?.toLowerCase();
    const subCmd = args[1]?.toLowerCase();
    const ownerRefs = context.owner ? [context.owner] : [];
    const tCtx = { sender, ownerRefs };

    if (!isOwner) {
      return msgMgr.sendTemp(sock, from, "❌ මෙම අණ ක්‍රියාත්මක කිරීමට ඔබට අවසර නැත. (Owner Only)", 5000);
    }

    // --- Commands ---

    // Toggle Global ON/OFF
    if (cmd === "on" || cmd === "enable") {
      appState.setAiAutoReply(true);
      return sock.sendMessage(from, { text: "✅ *AI Auto Reply Global:* ON" }, { quoted: msg });
    }
    if (cmd === "off" || cmd === "disable") {
      appState.setAiAutoReply(false);
      return sock.sendMessage(from, { text: "✅ *AI Auto Reply Global:* OFF" }, { quoted: msg });
    }

    // Toggle Voice
    if (cmd === "voice") {
      const mode = subCmd === "on" || subCmd === "enable";
      appState.setAiAutoVoice(mode);
      return sock.sendMessage(from, { text: `✅ *AI Voice Response:* ${mode ? 'ON 🔊' : 'OFF 🔇'}` }, { quoted: msg });
    }

    // Toggle for Current Chat
    if (cmd === "chat") {
      if (!from.endsWith("@g.us")) {
        return sock.sendMessage(from, { text: "⚠️ මෙම අණ පාවිච්චි කළ හැක්කේ ගෲප් වල පමණි." }, { quoted: msg });
      }
      const groupData = db.get("groups", from) || {};
      const mode = subCmd === "on" || subCmd === "enable";
      groupData.ai_auto = mode;
      db.set("groups", from, groupData);
      return sock.sendMessage(from, { text: `✅ *AI Auto Reply for this Chat:* ${mode ? 'ENABLED' : 'DISABLED'}` }, { quoted: msg });
    }

    // Persona Setting
    if (cmd === "persona" || cmd === "type") {
      const valid = ["friendly", "funny", "savage", "romantic", "professional", "robot"];
      if (!subCmd || !valid.includes(subCmd)) {
        return sock.sendMessage(from, { text: `⚠️ ලබාගත හැකි වර්ග: ${valid.join(", ")}` }, { quoted: msg });
      }
      appState.setAiAutoPersona(subCmd);
      return sock.sendMessage(from, { text: `✅ *AI Persona:* ${subCmd.toUpperCase()}` }, { quoted: msg });
    }

    // Language Setting
    if (cmd === "lang") {
      const valid = ["si", "en", "auto"];
      if (!subCmd || !valid.includes(subCmd)) {
        return sock.sendMessage(from, { text: `⚠️ ලබාගත හැකි වර්ග: si, en, auto` }, { quoted: msg });
      }
      appState.setAiAutoLang(subCmd);
      return sock.sendMessage(from, { text: `✅ *AI Language:* ${subCmd.toUpperCase()}` }, { quoted: msg });
    }

    // Display Menu
    const currentStatus = appState.getAiAutoReply() ? "ON ✅" : "OFF ❌";
    const voiceStatus = appState.getAiAutoVoice() ? "ON 🔊" : "OFF 🔇";
    const persona = appState.getAiAutoPersona();
    const lang = appState.getAiAutoLang();
    const groupMode = appState.getAiGroupMode() || 'mention';
    
    const personaDesc = {
      'friendly': 'හිතවත් මිතුරෙකු ලෙස',
      'funny': 'විහිළු තහළු කරන මිතුරෙකු ලෙස',
      'savage': 'ටිකක් Roast කරන, සැර මිතුරෙකු ලෙස',
      'romantic': 'ආදරණීය මිතුරෙකු ලෙස',
      'professional': 'වෘත්තීය සහයෙකු ලෙස',
      'robot': 'තාක්ෂණික බොට් ලෙස'
    };
    
    let menu = themeMgr.format("header", { title: "AI AUTO REPLY ULTRA" }, tCtx);
    menu += "\n";
    menu += themeMgr.format("box_start", { title: "CURRENT CONFIG" }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: `Global Status : ${currentStatus}` }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: `Voice Mode   : ${voiceStatus}` }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: `Persona      : ${persona.toUpperCase()} (${personaDesc[persona] || ''})` }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: `Language     : ${lang.toUpperCase()}` }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: `Group Mode   : ${groupMode.toUpperCase()}` }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: `Memory       : ENABLED (Auto)` }, tCtx);
    menu += themeMgr.format("box_end", {}, tCtx);
    menu += "\n";
    menu += themeMgr.format("box_start", { title: "COMMANDS" }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: ".aiauto <on/off> - Global Switch" }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: ".aiauto voice <on/off> - Voice Reply" }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: ".aiauto chat <on/off> - Group Toggle" }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: ".aiauto persona <type> - Change Style" }, tCtx);
    menu += themeMgr.format("box_item", { bullet: "default", content: ".aiauto lang <si/en/auto> - Language" }, tCtx);
    menu += themeMgr.format("box_end", {}, tCtx);
    menu += themeMgr.getSignature(sender, ownerRefs);

    await sock.sendMessage(from, { text: menu, mentions: [sender] }, { quoted: msg });
  },
};
