"use strict";

const { AsyncLocalStorage } = require("async_hooks");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { OWNER_NUMBER, BOT_NAME } = require("../config");
const msgMgr = require("./message-manager");
const { safeExecute } = require("./error-handler");
const db = require("./db");

const ownerContext = new AsyncLocalStorage();

function ownerTokens(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return [];
  const digits = raw.replace(/\D/g, "");
  const tokens = new Set([raw]);
  if (digits) {
    tokens.add(digits);
    tokens.add(`${digits}@s.whatsapp.net`);
  }
  return Array.from(tokens);
}

function normalizeOwner(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits) return `${digits}@s.whatsapp.net`;
  const raw = String(value || "").trim().toLowerCase();
  return raw || null;
}

function collectOwnerTokens(extraOwners = []) {
  const verified = db.getSetting("verified_owners");
  const configured = [
    OWNER_NUMBER,
    db.getSetting("main_owner"),
    ...(Array.isArray(verified) ? verified : []),
    ...(Array.isArray(extraOwners) ? extraOwners : [extraOwners]),
    ...((ownerContext.getStore() || {}).owners || []),
  ];
  return new Set(configured.flatMap(ownerTokens));
}

function withOwnerContext(owners, fn) {
  return ownerContext.run({ owners: Array.isArray(owners) ? owners : [owners].filter(Boolean) }, fn);
}

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

function isOwner(sender, extraOwners = []) {
  if (!sender) return false;
  
  const senderJid = String(sender).toLowerCase();
  const senderTokens = ownerTokens(senderJid);
  const owners = collectOwnerTokens(extraOwners);
  
  return senderTokens.some((token) => owners.has(token));

  return false;
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

module.exports = {
  sendReact,
  presenceUpdate,
  isOwner,
  normalizeOwner,
  withOwnerContext,
  isGroupAdmin,
  truncate,
  downloadMediaMessage,
};
