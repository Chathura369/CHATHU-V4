"use strict";

const msgMgr = require("../message-manager");
const themeMgr = require("../theme-manager");
const { isOwner, sendReact } = require("../utils");
const {
  isAntiViewOnceEnabled,
  setAntiViewOnceEnabled,
} = require("../viewonce-capture");

module.exports = {
  name: "antivo",
  aliases: ["antiviewonce", "viewonce"],
  category: "automation",
  description: "Toggle View Once auto-download and owner inbox forwarding.",

  async execute(sock, msg, from, args, cmdName, context) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const ownerRefs = context.owner ? [context.owner] : [];
    const tCtx = { sender, ownerRefs };

    if (!msg.key.fromMe && !isOwner(sender, ownerRefs)) {
      return msgMgr.sendTemp(sock, from, "❌ Only bot owner can use this command.", 5000);
    }

    const sessionId = context.sessionId || "__main__";
    const action = args[0]?.toLowerCase();

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
      } catch {}

      await sendReact(sock, from, msg, enabled ? "📥" : "🛑");
      const modeText = enabled
        ? "Media will be saved to *public/viewonce/*, logged in *viewonce-log.json*, and forwarded to owner inbox."
        : "View Once capture is now disabled.";
      return msgMgr.send(sock, from, {
        text: `✅ *Anti View Once ${enabled ? "enabled" : "disabled"}*.\n\n${modeText}`,
      });
    }

    const status = isAntiViewOnceEnabled(sessionId) ? "ON" : "OFF";
    let reply = themeMgr.format("header", { title: "ᴀɴᴛɪ ᴠɪᴇᴡ-ᴏɴᴄᴇ" }, tCtx);
    reply += "\n";
    reply += themeMgr.format("section", { title: "sʏsᴛᴇᴍ ᴄᴏɴғɪɢ" }, tCtx);
    reply += themeMgr.format("item", { bullet: "system", content: `Status : ${status}` }, tCtx);
    reply += themeMgr.format("item", { bullet: "default", content: "Usage  : .antivo on | .antivo off" }, tCtx);
    reply += themeMgr.format("item", { bullet: "default", content: "Save   : public/viewonce/ + viewonce-log.json" }, tCtx);
    reply += themeMgr.format("footer", {}, tCtx);
    reply += themeMgr.getSignature(sender, ownerRefs);

    return msgMgr.send(sock, from, { text: reply });
  },
};
