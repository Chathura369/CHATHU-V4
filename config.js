const path = require('path');

module.exports = {
  BOT_NAME: process.env.BOT_NAME || 'Chathu MD',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94742514900',
  PREFIX: process.env.PREFIX || '.',
  PORT: parseInt(process.env.PORT) || 5000,
  DASHBOARD_PASS: process.env.DASHBOARD_PASS || 'chathu123',
  ADMIN_USER: process.env.ADMIN_USER || 'chathu',
  ADMIN_PASS: process.env.ADMIN_PASS || 'chathu123',
  JWT_SECRET: process.env.JWT_SECRET || 'chathu_md_jwt_secret_2026_!@#$',
  SESSION_DIR: path.join(__dirname, 'session'),
  DOWNLOAD_DIR: path.join(__dirname, 'downloads'),
  BROWSER: ['ChathuMDBot', 'Chrome', '131.0'],
  SEARCH_CACHE_TTL: 300000,
  AUTO_READ: true,
  AUTO_TYPING: true,
  NSFW_ENABLED: true,
  PREMIUM_CODE: process.env.PREMIUM_CODE || 'CHATHU2026',
};
