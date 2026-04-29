# Testing the CHATHUMD-V3 dashboard

This skill covers end-to-end testing of the Express + Socket.IO dashboard that
fronts the WhatsApp bot. It is written for the post-PR-#3 codebase where the
app supports `DATA_DIR`, auto-provisioned JWT, and free-host healthchecks.

## When to use this skill

- Verifying any change in `dashboard.js`, `config.js`, `lib/db.js`,
  `session-manager.js`, or anything under `public/`.
- Free-host deploy readiness PRs (Railway / Render / Fly / Heroku / Docker).
- UI regressions in the redesigned Fleet Orchestration page (`public/pages/users.html`).
- Changes to `lib/viewonce-capture.js`, `lib/commands/viewonce.js`, or `state.js`
  anti-view-once toggle logic.

## Devin Secrets Needed

None for local testing. The app intentionally runs with zero secrets:

- `JWT_SECRET` is auto-generated and persisted under `${DATA_DIR}/.jwt_secret`.
- `ADMIN_PASS` falls back to the hardcoded default `chathura123` when the env
  var is unset (this is a local/dev-only fallback, NOT a real secret).

For real Railway / Render deploy verification you would want the user's
platform credentials — but those tests are out of scope for Devin.

## Default credentials

- URL: `http://localhost:<PORT>/login`
- User: `admin`
- Password: `chathura123` (only when `ADMIN_PASS` env is empty / unset)

## Sandboxed boot for free-host parity

Always boot under a clean `DATA_DIR` outside the repo so you don't pollute the
git working tree:

```bash
rm -rf /tmp/chathu-test
env -i PATH=$PATH HOME=$HOME \
    DATA_DIR=/tmp/chathu-test \
    PORT=5301 \
    ADMIN_PASS= JWT_SECRET= \
    nohup node index.js > /tmp/chathu-bot.log 2>&1 &
sleep 5
```

Then sanity-check:

```bash
curl -s http://localhost:5301/health    # JSON {ok:true,...}
curl -s http://localhost:5301/healthz   # plain "ok"
ls -la /tmp/chathu-test                 # .jwt_secret(0600), session/, sessions/, downloads/
wc -c /tmp/chathu-test/.jwt_secret      # exactly 96 bytes
```

## Hitting the auth-protected API

Login returns a JWT signed with the persisted secret:

```bash
TOKEN=$(curl -s -X POST http://localhost:5301/bot-api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"chathura123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -s http://localhost:5301/bot-api/sessions -H "Authorization: Bearer $TOKEN"
```

All `/bot-api/*` endpoints require the bearer token. Plain page routes
(`/login`, `/dashboard`, `/users`, …) are gated by a cookie set after login —
for browser tests just use the login form.

## Testing Privacy / Anti View-Once toggle

The Anti View-Once toggle lives in the Bot Settings modal under the
**Privacy / Anti-Delete** tab (sidebar item `Privacy / Anti-Delete`).

Navigation path:
1. Login → Dashboard
2. Sidebar → **Fleet Orchestration** (`/users`)
3. Click **Manage** on a session row → modal opens on General tab
4. Click **Privacy / Anti-Delete** in the left sidebar of the modal
5. The "Anti View-Once" checkbox (`#botAntiViewOnce`) is in the
   "ANTI-DELETE & PRIVACY ENGINE" section

To verify the toggle state via API:

```bash
# Check current state
curl -s http://localhost:5301/bot-api/sessions -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); m=[s for s in d if s['id']=='__main__'][0]; print('antiViewOnce:', m.get('antiViewOnce'))"

# Toggle ON via API
curl -s -X POST http://localhost:5301/bot-api/sessions/__main__/settings \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"antiViewOnce": true}'

# Toggle OFF via API
curl -s -X POST http://localhost:5301/bot-api/sessions/__main__/settings \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"antiViewOnce": false}'
```

Key assertions for Anti View-Once:
- On fresh boot with clean DATA_DIR, `antiViewOnce` should be `false` (OFF)
- The toggle in `state.js` uses `=== true` (not `!== false`) to match the
  codebase convention where features default to disabled
- `captureViewOnce` in `lib/viewonce-capture.js` must have a guard calling
  `isAntiViewOnceEnabled()` before processing — without this guard, `.antivo off`
  has no effect
- The dashboard label says "Save view-once media" but the actual behavior
  might be forwarding to owner — check the code to know what the current
  behavior is

## Restart-persistence test (proves JWT secret is reused, not regenerated)

This is the test that catches a regression where `.jwt_secret` would be
rewritten on every boot, silently invalidating already-issued admin tokens:

```bash
sha256sum /tmp/chathu-test/.jwt_secret > /tmp/pre.sha
save_token=$TOKEN
pkill -f "node index.js"; sleep 2
# restart on a different port, same DATA_DIR
env -i PATH=$PATH HOME=$HOME DATA_DIR=/tmp/chathu-test PORT=5302 ADMIN_PASS= JWT_SECRET= \
  nohup node index.js > /tmp/chathu-bot2.log 2>&1 &
sleep 5
sha256sum /tmp/chathu-test/.jwt_secret > /tmp/post.sha
diff /tmp/pre.sha /tmp/post.sha          # MUST be empty
curl -i http://localhost:5302/bot-api/sessions -H "Authorization: Bearer $save_token" | head -1
# MUST be HTTP/1.1 200
```

## Browser flow — Bot Settings modal

The redesigned modal lives on **Fleet Orchestration** (`/users`):

1. Login at `/login` → lands on `/dashboard`.
2. Sidebar → **Fleet Orchestration**.
3. Click **Manage** on a session row → modal opens.
4. Tabs in the left sidebar: General, Health, AI Engine, Automation, Modules,
   Privacy / Anti-Delete, Groups, Actions.

Quick DOM probes via `console`:

```js
document.querySelectorAll('.pro-section').length          // expect ≥ 1 on General/AI tabs
document.querySelectorAll('.advanced-section-inner').length // expect ≥ 1 on Anti-Delete tab
performance.getEntriesByType('resource')
  .filter(r => r.responseStatus >= 400).length             // expect 0
```

If either CSS class count returns `0` while the DOM is otherwise rendering,
the `npm run check:admin-ui` lint regression is back — re-add standalone
selectors to `public/css/app.css` (search for the existing `.pro-section,`
and `.advanced-section-inner` rules around line 3793).

## Static lint check before pushing

```bash
npm run check:admin-ui
```

Green output looks like `OK — 13 page(s) scanned, NN unique onclick handler(s) verified`.
This catches both missing CSS classes AND `onclick` handlers referencing
undefined functions in any `public/pages/*.html` or `public/admin.html`.

**Note:** The `scripts/check-admin-ui.js` file might not exist in all branches.
If you get `MODULE_NOT_FOUND`, this is a pre-existing issue — skip this check
and note it in your report.

## Things that look broken but are not

- **"Awaiting QR Scan" forever in tests.** The bot has no real WhatsApp
  pairing in this environment — that's expected. All UI/API tests should
  treat the session as a stub.
- **"Supreme MD Bot" label.** PR #1 only changed `.env.example`; the
  in-code default in `config.js` / fleet seed still says "Supreme MD Bot".
  Pre-existing, not a regression.
- **`replit.md` references.** This file is a Replit-specific manifest, not
  a CI dependency.
- **End-to-end media forwarding untestable.** Without a real WhatsApp
  connection, you cannot verify that View Once media actually gets forwarded
  to the owner's number. Test the toggle, API persistence, and code path
  instead.
- **No CI checks on this repo.** The only "check" is Devin Review (not a
  GitHub Action). Don't wait for CI to pass — there is none.

## Cleanup

```bash
pkill -f "node index.js"
rm -rf /tmp/chathu-test
```

Never commit `db.json`, `session/`, `sessions/`, `downloads/`, or `.jwt_secret`
to the repo — they're already in `.gitignore` but make sure your DATA_DIR
lives outside the repo tree.
