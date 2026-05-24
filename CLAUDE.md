# WhatsApp SaaS Bot — Project Context

## Project Overview
Ek multi-client WhatsApp bot SaaS platform hai jisme clients apna WhatsApp bot manage kar sakte hain.

## Live Deployment
- **URL:** https://shivangi-saas-bot.onrender.com
- **Admin Panel:** https://shivangi-saas-bot.onrender.com/app
- **GitHub:** https://github.com/sandipdubey773-glitch/shivangi-saas-bot
- **Platform:** Render (free tier — ephemeral filesystem)

## Tech Stack
- **Backend:** Node.js + Express (port 3000)
- **Frontend:** React + Vite → built to `backend/public/`
- **WhatsApp:** Baileys (QR/pairing) + Meta Business Cloud API
- **Database:** lowdb v1 (`data.json`) — ephemeral on Render
- **Persistence:** Firebase Realtime Database (leads + WA session only)
- **Scheduler:** node-cron (3 jobs: 7pm report, 8am reminders, 10am followups)

## Active Client — Shivangi Auto Clinic
- **Business:** Two-wheeler service center, Surat
- **AI:** Gemini
- **Bot name:** Shivi
- **Owner phone:** 9327363931
- **Lead group:** 120363408770227875@g.us
- **Google Sheet webhook:** configured

## Key Architecture Decisions

### Single Baileys Session
System ek hi WhatsApp number Baileys se support karta hai. Naye clients ke liye Meta Business API use karna chahiye.

### Meta API Routing
`sendMessage()` in `wa-sessions.js` automatically routes:
- Agar `client.metaPhoneNumberId` + `client.metaAccessToken` set hai → Meta API
- Warna → Baileys

### @lid JID Issue
Newer WhatsApp users send `@lid` JIDs (e.g. `180578125148299@lid`) — yeh privacy IDs hain, real phone numbers nahi. Real number tab milta hai jab customer khud share kare.

### Data Persistence
- `data.json` (lowdb) → wipes on Render redeploy
- Firebase → leads + WA session persist karte hain
- `db.js` → auto-seeds client on empty DB restart

## Key Files
```
backend/
  index.js                    — Express server, QR page, /wa-status
  db.js                       — lowdb init + auto-seed logic
  data.json                   — runtime DB (gitignored, ephemeral)
  routes/
    admin.js                  — Admin CRUD, send-message, bot-toggle, resolve
    client.js                 — Client portal API (login, inbox, meta-config, etc.)
    meta-webhook.js           — Meta incoming webhook (GET verify + POST messages)
    booking.js (route)        — Leads API for feedback page
  services/
    wa-sessions.js            — Baileys session + Meta routing + message handling
    booking.js                — Lead system, Firebase persistence, cron reports
    reporter.js               — Daily conversation report generator
    meta-api.js               — Meta Business API sendMessage + parseIncoming
    ai.js                     — Gemini/OpenAI callAI wrapper
    firebase-auth-state.js    — Firebase WA session persistence
  middleware/
    auth.js                   — Admin token check (x-admin-token header)
    clientAuth.js             — Client token check (x-client-token header)
  public/                     — Built React frontend (from frontend/dist/)

frontend/src/
  pages/
    AdminPanel.jsx            — Main admin dashboard
    InboxPage.jsx             — AI Sensy style inbox for admin (/client/:id/inbox)
    ClientPortal.jsx          — Client login portal with Inbox tab
  components/
    ClientCard.jsx            — Admin client card with Inbox button
    ConversationLog.jsx       — Chat log viewer
  api.js                      — All API calls (api, leadsApi, clientApi)
  App.jsx                     — React router
```

## Admin Panel Features
- Client CRUD (add/edit/delete/toggle)
- WhatsApp connect (QR + pairing code)
- Meta API credentials management
- AI Sensy style Inbox (conversations, chat bubbles, bot toggle, resolve, new chat)
- Leads dashboard with feedback

## Client Portal Features (client login)
- Home (bot status, plan info)
- Inbox (full AI Sensy style — conversations, send message, bot toggle, resolve)
- Stats, Chat logs, Report preview
- Prompt editor
- WhatsApp Setup (Meta API credentials + webhook URL)

## Lead System
- Bot captures lead via `[LEAD_READY:naam=X|mobile=X|vehicle=X|area=X|date=X]` marker
- 5-min auto-lead timer fires if customer goes silent (source: `meta_5min`)
- Duplicate prevention: same customerJid + same date → update existing lead
- Notifications: personal (reportPhone) + group (leadGroup)
- Feedback page: `/f/:leadId` — no auth needed

## Bot Per-Conversation Disable
- `botEnabled` flag on each conversation
- When `false` → incoming messages saved but no AI reply
- Admin + Client portal both have bot toggle button per conversation

## Scheduled Jobs (IST timezone)
- 7:00 PM — Evening report to lead group
- 8:00 AM — Service reminders to today's leads
- 10:00 AM — Follow-up alert for yesterday's uncalled leads

## Deploy Process
```bash
cd frontend && npm run build
cp -r dist/. ../backend/public/
cd ../backend && git add -A && git commit -m "message" && git push origin main
```
Render auto-deploys on push. Takes ~2-3 minutes.

## Admin Credentials
- Token: [check with owner] (sent via x-admin-token header)

## Known Limitations
- Conversations not persisted to Firebase (wiped on redeploy)
- Single Baileys session (one WA number only)
- @lid contacts — phone number not extractable from JID
