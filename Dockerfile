# syntax=docker/dockerfile:1.6
# Production-ish Dockerfile for free hosts that use Docker (Fly.io, Cloud Run,
# DigitalOcean App Platform, etc.). For Railway/Render the nixpacks.toml +
# render.yaml are simpler; this Dockerfile is here as a fallback.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates ffmpeg python3 yt-dlp \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates ffmpeg python3 yt-dlp tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Persistent volume mount target
RUN mkdir -p /data

# Optional: container HEALTHCHECK matches /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

EXPOSE 5000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--max-old-space-size=512", "index.js"]
