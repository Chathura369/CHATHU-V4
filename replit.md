# CHATHU MD Bot — v3.0.0

## Overview
A professional-grade WhatsApp multi-device bot built with Baileys, featuring a Cyber-Glass Admin Dashboard. It supports 89+ commands, multi-session management, real-time monitoring, and anti-crash recovery.

## Architecture
- **Runtime**: Node.js 20
- **Entry point**: `index.js` (bootloader + anti-crash engine)
- **Bot core**: `bot.js` (WhatsApp socket via @whiskeysockets/baileys)
- **Dashboard**: `dashboard.js` (Express + Socket.IO web dashboard on port 5000)
- **Session manager**: `session-manager.js` (multi-device account handler)
- **Commands**: `lib/handler.js` (89 commands across media, search, utility, fun, NSFW)
- **Frontend**: `public/admin.html` (Cyber-Glass UI served as SPA)
- **Config**: `config.js` (reads from env vars with defaults)

## Key Configuration (environment variables)
| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Dashboard port |
| `BOT_NAME` | `Chathu MD` | Bot display name |
| `OWNER_NUMBER` | `94742514900` | WhatsApp owner number |
| `PREFIX` | `.` | Command prefix |
| `ADMIN_USER` | `admin` | Dashboard login username |
| `ADMIN_PASS` | `chathura123` | Dashboard login password |
| `JWT_SECRET` | (set in env) | JWT signing secret |
| `PREMIUM_CODE` | `SUPREME2026` | Premium unlock code |

## Running the App
```bash
npm start
# Dashboard available at http://localhost:5000
```

## Deployment
- Target: `vm` (always-running, maintains WhatsApp session state)
- Run command: `node --max-old-space-size=1024 index.js`

## Directories Created at Runtime
- `session/` — main bot session data (gitignored)
- `downloads/` — temporary media downloads (gitignored)
