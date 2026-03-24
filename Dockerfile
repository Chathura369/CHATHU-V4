FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY artifacts/bot/package*.json ./

RUN npm install --production

COPY artifacts/bot/ .

RUN mkdir -p session downloads

EXPOSE 5000

CMD ["node", "index.js"]
