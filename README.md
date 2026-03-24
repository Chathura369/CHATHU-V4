

## Features

- **Multi-Session Management** – Run and manage multiple WhatsApp sessions simultaneously
- **Admin Dashboard** – Cyberpunk-themed web panel to control everything
- **QR / Pair Code Linking** – Connect WhatsApp accounts via QR scan or pair code
- **Broadcast** – Send messages to multiple recipients/groups at once
- **Economy System** – Virtual currency with wallet, transfer, leaderboard
- **88+ Commands** – Media, utilities, fun, NSFW (toggleable), and more
- **Scheduler** – Schedule messages to send at a specific time
- **Auto-Reply** – Set up automated responses with custom triggers
- **Group Moderation** – Kick, add, promote, anti-link, welcome messages
- **User Management** – Block, unblock, grant premium access

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Local Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/supreme-md-bot.git
cd supreme-md-bot

# Install dependencies
npm install

# Copy environment file and edit your settings
cp .env.example .env

# Start the bot
npm start
```

Then open `http://localhost:5000` in your browser and log in.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP server port |
| `OWNER_NUMBER` | `94742514900` | WhatsApp number (with country code, no +) |
| `ADMIN_USER` | `admin` | Dashboard login username |
| `ADMIN_PASS` | `chathura123` | Dashboard login password |
| `JWT_SECRET` | (set this!) | Secret for JWT tokens |
| `BOT_NAME` | `CHATHU MD Bot` | Display name |
| `PREFIX` | `.` | Command prefix character |
| `PREMIUM_CODE` | `SUPREME2026` | Code users enter to unlock premium |

## Deploy to Railway

1. Fork this repository on GitHub
2. Go to [railway.app](https://railway.app) -> New Project -> Deploy from GitHub
3. Select your forked repo
4. Add environment variables in the Railway dashboard (see table above)
5. Railway auto-deploys - visit your Railway URL to access the dashboard

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

## Project Structure

```
├── index.js          # Bot entry point
├── dashboard.js      # Express REST API + Socket.IO server
├── config.js         # Configuration (reads from env vars)
├── commands.js       # All 88+ command handlers
├── session/          # Baileys session credentials (gitignored)
├── downloads/        # Temp download folder (gitignored)
├── railway.json      # Railway deployment config
└── .env.example      # Example environment variables
```

## Default Dashboard Credentials

- **Username:** `admin`
- **Password:** `chathura123`

Change these using environment variables before deploying!

## License

MIT
