"use strict";

const fs = require("fs");
const path = require("path");

const LOCAL_BANNER_CANDIDATES = [
  path.join(__dirname, "..", "public", "assets", "banner.jpg"),
  path.join(__dirname, "..", "public", "assets", "banner.png"),
  path.join(__dirname, "..", "public", "banner.jpg"),
  path.join(__dirname, "..", "public", "banner.png"),
];

function getLocalBannerPath() {
  return LOCAL_BANNER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

async function sendBannerMessage(sock, from, options = {}) {
  const {
    caption = "",
    text = caption,
    mentions = [],
    contextInfo,
    quoted,
  } = options;

  const bannerPath = getLocalBannerPath();
  if (bannerPath) {
    try {
      return await sock.sendMessage(
        from,
        {
          image: fs.readFileSync(bannerPath),
          caption,
          mentions,
          ...(contextInfo ? { contextInfo } : {}),
        },
        quoted ? { quoted } : undefined
      );
    } catch {}
  }

  return sock.sendMessage(
    from,
    {
      text,
      mentions,
      ...(contextInfo ? { contextInfo } : {}),
    },
    quoted ? { quoted } : undefined
  );
}

module.exports = {
  getLocalBannerPath,
  sendBannerMessage,
};
