"use strict";

const path = require("path");
const DEFAULT_ADMIN_PASS = "chathura123";
const DEFAULT_JWT_SECRET = "replace_this_jwt_secret_before_production";

function readInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

module.exports = {
  BOT_NAME: process.env.BOT_NAME || "Chathu MD",
  OWNER_NUMBER: process.env.OWNER_NUMBER || "94742514900",
  PREFIX: process.env.PREFIX || ".",
  PORT: readInt(process.env.PORT, 5000),
  ADMIN_USER: readString(process.env.ADMIN_USER, "admin"),
  ADMIN_PASS: readString(process.env.ADMIN_PASS),
  JWT_SECRET: readString(process.env.JWT_SECRET),
  PREMIUM_CODE: process.env.PREMIUM_CODE || "CHATHU2026",
  SESSION_DIR: path.join(__dirname, "session"),
  DOWNLOAD_DIR: path.join(__dirname, "downloads"),
  BROWSER: ["Ubuntu", "Chrome", "20.0.04"],
  SEARCH_CACHE_TTL: readInt(process.env.SEARCH_CACHE_TTL, 300000),
  DOWNLOAD_CACHE_TTL: readInt(process.env.DOWNLOAD_CACHE_TTL, 10 * 60 * 1000),
  AUTO_READ: String(process.env.AUTO_READ || "true").toLowerCase() !== "false",
  AUTO_TYPING: String(process.env.AUTO_TYPING || "true").toLowerCase() !== "false",
  NSFW_ENABLED: String(process.env.NSFW_ENABLED || "true").toLowerCase() !== "false",
  WORK_MODE: process.env.WORK_MODE || "public",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  DEFAULT_ADMIN_PASS,
  DEFAULT_JWT_SECRET,
};
