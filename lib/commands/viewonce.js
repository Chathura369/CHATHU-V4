"use strict";

const msgMgr = require("../message-manager");
const themeMgr = require("../theme-manager");
const { isOwner, sendReact } = require("../utils");
const {
  isAntiViewOnceEnabled,
  setAntiViewOnceEnabled,
  getAntiDeleteConfig,
} = require("../viewonce-capture");

module.exports = {
  name: "antivo",
  aliases: ["antiviewonce", "viewonce"],
  category: "automation",
  description: "Toggle View Once auto-download (saves to folder).",

  async execute(sock, msg, from, args, cmdName, context) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const ownerRefs = context.owner ? [context.owner] : [];
    const tCtx = { sender, ownerRefs };

    if (!msg.key.fromMe && !isOwner(sender, ownerRefs)) {
      return msgMgr.sendTemp(sock, from, "❌ Only bot owner can use this command.", 5000);
    }

    const sessionId = context.sessionId || "__main__";
    const action = args[0]?.toLowerCase();
    const subAction = args[1]?.toLowerCase();

    if (action === "on" || action === "off") {
      const enabled = action === "on";
      const result = await setAntiViewOnceEnabled(sessionId, enabled);
      if (result?.error) {
        return msgMgr.sendTemp(sock, from, `❌ ${result.error}`, 5000);
      }

      try {
        const dashboard = require("../../dashboard");
        if (dashboard.io) {
          const payload = sessionId === "__main__"
            ? dashboard.getMainSessionPayload()
            : result.session;
          if (payload) dashboard.io.emit("session:update", payload);
        }
      } catch { }

      await sendReact(sock, from, msg, enabled ? "📥" : "🛑");

      const modeText = enabled
        ? "✅ Saved to *public/viewonce/* folder (save only)"
        : "View Once capture is now disabled.";

      return msgMgr.send(sock, from, {
        text: `✅ *Anti View Once ${enabled ? "enabled" : "disabled"}*.\n\n${modeText}`,
      });
    }

    if (action === "forward") {
      await sendReact(sock, from, msg, "🚫");
      return msgMgr.send(sock, from, {
        text: "ℹ️ Forwarding has been removed. View Once media is saved to *public/viewonce/* only."
      });
    }

    const status = isAntiViewOnceEnabled(sessionId) ? "ON" : "OFF";
    const cfg = getAntiDeleteConfig(sessionId);
    const target = String(cfg.target || 'chat').toUpperCase();

    let reply = themeMgr.format("header", { title: "ᴀɴᴛɪ ᴠɪᴇᴡ-ᴏɴᴄᴇ" }, tCtx);
    reply += "\n";
    reply += themeMgr.format("section", { title: "sʏsᴛᴇᴍ ᴄᴏɴғɪɢ" }, tCtx);
    reply += themeMgr.format("item", { bullet: "system", content: `Status   : ${status}` }, tCtx);
    reply += themeMgr.format("item", { bullet: "system", content: `Mode     : Save only` }, tCtx);
    reply += themeMgr.format("item", { bullet: "system", content: `Target   : ${target}` }, tCtx);
    reply += themeMgr.format("item", { bullet: "default", content: "Usage    : .antivo on | .antivo off" }, tCtx);
    reply += themeMgr.format("item", { bullet: "default", content: "Save     : public/viewonce/ folder" }, tCtx);
    reply += themeMgr.format("footer", {}, tCtx);
    reply += themeMgr.getSignature(sender, ownerRefs);

    return msgMgr.send(sock, from, { text: reply });
  },
};