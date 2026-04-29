# Testing the CHATHU-V4 Dashboard

## Quick Start

```bash
# Kill any existing instance
fuser -k 5301/tcp 2>/dev/null; sleep 2

# Boot with clean data dir outside repo
rm -rf /tmp/chathu-test
mkdir -p /tmp/chathu-test
cd /home/ubuntu/CHATHU-V4
env -i PATH="$PATH" HOME="$HOME" DATA_DIR=/tmp/chathu-test PORT=5301 ADMIN_PASS= JWT_SECRET= nohup node index.js > /tmp/chathu-bot.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}" http://localhost:5301/login  # expect 200
```

## Default Credentials

- **Username**: `admin`
- **Password**: `chathura123` (works when `ADMIN_PASS` env var is unset)
- Login endpoint: `POST /bot-api/auth/login` with JSON `{"username":"admin","password":"chathura123"}`
- Returns JWT token in `{"token": "..."}`

## Auth Pattern

- All `/bot-api/*` endpoints require `Authorization: Bearer <token>` header
- The frontend JS uses `api(path, opts)` function (defined in `public/js/app.js`) which auto-attaches the token from `State.token` (stored in `localStorage` as `chmd_token`)
- For `<img>` and `<video>` src attributes that can't send headers, viewonce media endpoints also accept `?token=<jwt>` query param (scoped only to `/bot-api/viewonce/:name` and `/bot-api/viewonce/:name/download`)

## Frontend Conventions

- **API calls**: Use `api()` function, NOT `fetch()` or `apiFetch()`. `api()` is defined in `public/js/app.js:92`
- **Confirm dialogs**: Use `confirmDialog(message, options)` — returns a Promise. NOT `showConfirm()`
- **Toast notifications**: Use `toast(message, type)` — NOT `showToast()`
- **HTML escaping**: Use `escapeHtml(s)` from app.js — do not redefine locally
- **Element lookup**: Use `byId(id)` shorthand
- **Page meta tag**: Each page HTML has `<meta name="page" content="page_name" />` for routing
- **Page IDs**: Must be added to `PAGE_IDS` array in `dashboard.js` (~line 525)
- **Sidebar nav**: Must be added to ALL page HTML files (admin.html + every file in public/pages/)

## UI Navigation Map

Not every page has a direct sidebar entry. Two important non-obvious paths:

- **Per-session bot settings** (Anti-Delete, Anti View-Once, Auto Cleanup, Storage Limit, Recovery Routing, AI Engine, Modules, Groups, etc.):
  Sidebar **Fleet Orchestration** → **Manage** button on the session row → **Bot Settings** modal → tab **Privacy / Anti-Delete** (and other tabs).
  The page is `public/pages/users.html` (`meta name="page" content="users"`); URL `/users` opens it. The Anti View-Once switch is `#botAntiViewOnce` and saves auto-on-toggle (header reads "All changes saved").
  - Saves via `POST /bot-api/sessions/__main__/settings {antiViewOnce:true}` for the main session, or `/bot-api/sessions/<id>/settings` for sub-sessions.
  - Persists to `db.setting('anti_view_once')` — the **same** key `bot.js:734` reads in the capture loop (`lib/viewonce-capture.js:209-211`).

- **User Management** (sidebar "User Management") is a *different* page — `public/pages/users_db.html` (`meta page=users_db`, URL `/users_db`). It manages user records (Owner / Premium / Restrict roles), NOT bot session settings. Do not confuse the two.

- **Sessions** (sidebar "Sessions", URL `/sessions`) only shows QR / Pair / Retry buttons for connecting WhatsApp. Per-session bot settings live on Fleet Orchestration's `Manage` modal as above.

## Seeding Test Data

For features that need test files (e.g., View Once Gallery):

```bash
# Create test image
python3 -c "
from PIL import Image, ImageDraw
img = Image.new('RGB', (640, 480), color='blue')
d = ImageDraw.Draw(img)
d.text((200, 220), 'Test Image', fill='white')
img.save('/tmp/chathu-test/viewonce/1777470000000_TestUser.jpg')
"

# Create test video
ffmpeg -y -f lavfi -i 'color=c=red:s=640x480:d=3' \
  -vf 'drawtext=text=Test Video:fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2' \
  -c:v libx264 -pix_fmt yuv420p \
  /tmp/chathu-test/viewonce/1777470001000_VideoSender.mp4

# Seed metadata log
cat > /tmp/chathu-test/viewonce-log.json << 'EOF'
[
  {"filename":"1777470000000_TestUser.jpg","sender":"TestUser","senderJid":"94771234567@s.whatsapp.net","chatJid":"94771234567@s.whatsapp.net","sessionId":"__main__","mediaType":"image","mimetype":"image/jpeg","size":5954,"timestamp":1777470000000},
  {"filename":"1777470001000_VideoSender.mp4","sender":"VideoSender","senderJid":"94779876543@s.whatsapp.net","chatJid":"120363999999999999@g.us","sessionId":"bot2","mediaType":"video","mimetype":"video/mp4","size":8744,"timestamp":1777470001000}
]
EOF
```

## Key Directories

- `DATA_DIR`: Base data directory (default: project root, use `/tmp/chathu-test` for testing)
- View-once files: `DATA_DIR/viewonce/` (NOT `DATA_DIR/public/viewonce/`)
- View-once metadata: `DATA_DIR/viewonce-log.json`
- Database: `DATA_DIR/db.json`
- Sessions: `DATA_DIR/sessions/`

## Common Pitfalls

1. **Port already in use**: The app won't start if port 5301 is occupied. Always kill existing processes first with `fuser -k 5301/tcp`
2. **Old server running**: If you update code, you must restart the server — it doesn't hot-reload
3. **Inline scripts in page HTML**: Scripts in page HTML files run after `app.js` loads (it's included via `<script src="/js/app.js"></script>` before inline scripts). Use functions from app.js directly — don't redefine them.
4. **Static file security**: Files under `public/` are served without auth by Express static middleware. Never put sensitive files there.
5. **check:admin-ui script**: `npm run check:admin-ui` may fail because `scripts/check-admin-ui.js` might not exist. This is a known repo issue — skip it.
6. **`npm install` postinstall failure**: `ffmpeg-static`'s postinstall fetches a binary from GitHub releases and can fail in restricted networks (502 etc.). Use `npm install --ignore-scripts` — `ffmpeg` is already on the system at `/usr/bin/ffmpeg` and the bot logs `[ffmpeg] Using: /usr/bin/ffmpeg` at startup, so the bundled binary is not required.

## Devin Secrets Needed

No secrets required for local testing — default credentials work when `ADMIN_PASS` is unset.

## Playwright Login Script

```python
import asyncio
from playwright.async_api import async_playwright

async def login():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:29229")
        context = browser.contexts[0]
        page = context.pages[-1]
        await page.goto("http://localhost:5301/login")
        await page.wait_for_load_state("networkidle")
        await page.fill('input[name="username"], input#username, input[placeholder*=admin i]', 'admin')
        await page.fill('input[type="password"]', 'chathura123')
        await page.click('button:has-text("Sign In")')
        await page.wait_for_url('**/admin*', timeout=10000)

asyncio.run(login())
```
