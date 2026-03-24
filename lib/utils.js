"use strict";

const { OWNER_NUMBER, BOT_NAME } = require("../config");
const msgMgr = require("./message-manager");
const { safeExecute } = require("./error-handler");

async function sendReact(sock, from, msg, emoji) {
  if (!sock || !from || !msg?.key || !emoji) return;
  await msgMgr.react(sock, from, msg.key, emoji);
}

async function presenceUpdate(sock, from, type = "composing") {
  if (!sock || !from) return;
  await safeExecute(
    () => sock.sendPresenceUpdate(type, from),
    "PresenceUpdate",
  );
}

function isOwner(sender) {
  if (!sender) return false;
  return sender.replace(/\D/g, "") === OWNER_NUMBER.replace(/\D/g, "");
}

async function isGroupAdmin(sock, from, sender) {
  if (!sock || !from || !sender) return false;
  if (!from.endsWith("@g.us")) return false;
  try {
    const meta = await sock.groupMetadata(from);
    const p = meta?.participants?.find((x) => x.id === sender);
    return p?.admin === "admin" || p?.admin === "superadmin";
  } catch {
    return false;
  }
}

function truncate(str, max = 50) {
  if (!str || typeof str !== "string") return "Unknown";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

const theme = {
  header: (title, emoji = "⭐") =>
    `╭───「 *${BOT_NAME}* 」───╮\n│\n│ ${emoji} *${title.toUpperCase()}*\n│`,
  field: (key, val, emoji = "◈") => `│ ${emoji} *${key}:* ${val}`,
  line: (text, emoji = "│") => `${emoji} ${text}`,
  divider: "│\n├───────────────────────────",
  footer: () => `│\n╰───────────────────────────╯\n  _Premium AI Experience • v3.5_`,
  list: (items) => items.map((item, i) => `│ ${i + 1}. ${item}`).join("\n│\n"),
};

module.exports = {
  sendReact,
  presenceUpdate,
  isOwner,
  isGroupAdmin,
  truncate,
  theme,
};
