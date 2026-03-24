# 🌸 CHATHU MD Bot — v2.1.0 🌸

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-blue.svg)](https://github.com/WhiskeySockets/Baileys)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**CHATHU MD** is a professional-grade, high-performance WhatsApp multi-device bot featuring the stunning **Cyber-Glass Admin Dashboard** (v3). Engineered for 24/7 stability, it provides a seamless management experience for both single and multiple accounts.

---

## 💎 Key Features

- **🌐 Cyber-Glass Admin Panel (v3)**: A beautiful, real-time web dashboard with glassmorphism aesthetics for full bot control.
- **⚡ Cyber-Pulse Monitor**: High-precision real-time monitoring of Network (Rx/Tx) and System Memory (Node.js Heap).
- **📱 Multi-Device Session Manager**: Link and manage multiple WhatsApp accounts concurrently with high-visibility pairing codes (phone number link) or QR scans.
- **🛡️ Global Protections**: Integrated Anti-Link and Anti-Spam protection systems with dashboard toggle support.
- **🌸 Premium Menu System**: Elegant, Sakura-themed command menu with 89+ powerful commands (Media, Search, Utility, Fun, NSFW).
- **🔄 Auto-Self Healing**: Built-in anti-crash loop that recovers the system within 10 seconds of any fatal failure.
- **💬 Broadcast Manager**: Send announcements to all groups or users with history tracking.

---

## 🚀 Quick Start

### 📋 Prerequisites

- **Node.js**: 18.x or 20.x
- **Git**: Installed for repository management

### ⚙️ Installation

```bash
# Clone the repository
git clone https://github.com/Chathura369/MY-BOT-V2.git
cd MY-BOT-V2

# Install dependencies
npm install

# Start the command center
npm start
```

Once started, open **`http://localhost:5000`** in your browser to access the Cyber-Glass Dashboard.

---

## 🔒 Configuration

Edit the `config.js` or create a `.env` file to set your primary credentials:

| Variable | Default | Description |
|---|---|---|
| `OWNER_NUMBER` | `94711122233` | Primary bot owner WhatsApp number |
| `ADMIN_USER` | `admin` | Dashboard login username |
| `ADMIN_PASS` | `chathu123` | Dashboard login password |
| `PREFIX` | `.` | Command prefix for triggers |
| `JWT_SECRET` | `secret` | Digital signature for dashboard auth |

---

## 🧩 Project Architecture

```bash
├── index.js          # Bootloader & Anti-Crash Engine
├── bot.js            # Core WhatsApp Socket & Message Pipeline
├── dashboard.js      # Express API & Socket.IO Dashboard Server
├── session-manager.js # Multi-Device Account Handler
├── lib/              # Centralized Command & Utility Logic
├── public/           # Admin Dashboard (Cyber-Glass UI)
├── session/          # Main Bot Session Data (Gitignored)
└── sessions/         # Secondary Account Data (Gitignored)
```

---

## 🔑 Default Credentials

- **Username:** `admin`
- **Password:** `chathu123`

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

**Developed with ❤️ by Chathura**  
*Empowering your WhatsApp experience with speed and style.*
