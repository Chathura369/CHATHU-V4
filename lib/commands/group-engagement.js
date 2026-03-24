"use strict";

const db = require("../db");
const msgMgr = require("../message-manager");
const { isOwner } = require("../utils");

module.exports = [
  {
    name: "welcome",
    description: "Enable or disable welcome messages for the current group.",
    category: "group",
    async execute(sock, msg, from, args) {
      if (!from.endsWith("@g.us")) {
        return msgMgr.sendTemp(sock, from, "⚠️ This command only works in groups.", 5000);
      }

      const sender = msg.key.participant || msg.key.remoteJid;
      const isAdmin = (await sock.groupMetadata(from)).participants.find(p => p.id === sender)?.admin;
      if (!isAdmin && !isOwner(sender)) {
        return msgMgr.sendTemp(sock, from, "❌ Only group admins can use this command.", 5000);
      }

      const action = args[0]?.toLowerCase();
      if (action === "on") {
        db.update("groups", from, { welcome: true });
        await msgMgr.send(sock, from, { text: "✅ *Welcome messages enabled* for this group." });
      } else if (action === "off") {
        db.update("groups", from, { welcome: false });
        await msgMgr.send(sock, from, { text: "✅ *Welcome messages disabled* for this group." });
      } else {
        const status = db.get("groups", from)?.welcome ? "on" : "off";
        await msgMgr.send(sock, from, { text: `👋 *Welcome Status:* ${status.toUpperCase()}\n\nUsage: .welcome [on|off]` });
      }
    },
  },
  {
    name: "goodbye",
    description: "Enable or disable goodbye messages for the current group.",
    category: "group",
    async execute(sock, msg, from, args) {
      if (!from.endsWith("@g.us")) {
        return msgMgr.sendTemp(sock, from, "⚠️ This command only works in groups.", 5000);
      }

      const sender = msg.key.participant || msg.key.remoteJid;
      const isAdmin = (await sock.groupMetadata(from)).participants.find(p => p.id === sender)?.admin;
      if (!isAdmin && !isOwner(sender)) {
        return msgMgr.sendTemp(sock, from, "❌ Only group admins can use this command.", 5000);
      }

      const action = args[0]?.toLowerCase();
      if (action === "on") {
        db.update("groups", from, { goodbye: true });
        await msgMgr.send(sock, from, { text: "✅ *Goodbye messages enabled* for this group." });
      } else if (action === "off") {
        db.update("groups", from, { goodbye: false });
        await msgMgr.send(sock, from, { text: "✅ *Goodbye messages disabled* for this group." });
      } else {
        const status = db.get("groups", from)?.goodbye ? "on" : "off";
        await msgMgr.send(sock, from, { text: `🏃‍♂️ *Goodbye Status:* ${status.toUpperCase()}\n\nUsage: .goodbye [on|off]` });
      }
    },
  },
];
