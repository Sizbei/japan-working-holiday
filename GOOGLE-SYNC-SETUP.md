# Turning on Google Calendar sync (~5 min)

The dashboard can push your trip events into a dedicated **"Japan WHV"** Google calendar (one-way:
the app writes to Google, never the reverse). It ships **off** until you add your own OAuth Client ID.
No backend, no secret — the Client ID is *public* by design and safe to commit.

## What you'll do
1. Make a free Google OAuth **Client ID** in Google Cloud Console.
2. Paste it into one line of `docs/assets/google-sync.js`.
3. On the Calendar page, click **Google → Connect**.

---

## Step 1 — Google Cloud Console

1. Go to <https://console.cloud.google.com/> and **create a project** (any name, e.g. "japan-whv").
2. **Enable the Calendar API:** APIs & Services → **Library** → search "Google Calendar API" → **Enable**.
3. **OAuth consent screen:** APIs & Services → **OAuth consent screen**
   - User type: **External** → Create.
   - App name + your email; save.
   - **Test users:** add your own Google account. (Keeping the app in "Testing" means **no Google
     verification is needed** — it just works for you.)
4. **Create the Client ID:** APIs & Services → **Credentials** → **Create credentials** →
   **OAuth client ID**
   - Application type: **Web application**.
   - **Authorized JavaScript origins** — add BOTH:
     - `https://sizbei.github.io`
     - `http://localhost:8000` (for local testing)
   - Leave "Authorized redirect URIs" **empty** (the token model doesn't use a redirect).
   - **Create** → copy the **Client ID** (looks like `1234-abcd.apps.googleusercontent.com`).

## Step 2 — Paste it in

In `docs/assets/google-sync.js`, line ~9:

```js
const CLIENT_ID = '';   // ← paste your Client ID here, e.g. '1234-abcd.apps.googleusercontent.com'
```

Commit + push (or just tell me the Client ID and I'll wire it in).

## Step 3 — Connect

On the dashboard → **Calendar** → **Google** button → **Connect**:
- A consent popup appears (allow popups for the site).
- It creates the **"Japan WHV"** calendar and pushes your events.
- Re-sync any time — it **updates** existing events (no duplicates).
- **Disconnect** drops the token + clears the link map.

---

## Notes
- **Scope:** `calendar.app.created` — the app can manage **only the calendar it creates**, nothing else
  in your Google account.
- **Token:** lives in memory only (never localStorage), expires in ~1h; re-auth is silent after the
  first consent.
- **The "Japan WHV" calendar is a push target** — don't hand-edit it; your edits there get overwritten
  on the next sync.
- The CSP already allows the Google origins, so nothing else needs changing.
