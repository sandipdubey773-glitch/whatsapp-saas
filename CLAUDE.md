# WaFlow — WhatsApp Bot SaaS Platform

## Platform Overview
Multi-client WhatsApp bot SaaS. Admin ek dashboard se multiple clients manage karta hai. Har client ka apna WhatsApp bot hota hai jo AI se automatically customers ko reply karta hai.

**Branding:** WaFlow (Wa + Flow — logo: 🤖, color: #818cf8 indigo)

## Live URLs
- **Admin Panel:** https://api.shivangiautoclinic.com/app
- **Client Portal:** https://api.shivangiautoclinic.com/app/client-login
- **API Base:** https://api.shivangiautoclinic.com
- **GitHub:** https://github.com/sandipdubey773-glitch/whatsapp-saas
- **Cloudflare Tunnel:** `cloudflared tunnel run shivangi-bot` (local laptop se)

## Deployment Setup
- **Server:** Local laptop (Windows 10), Node.js
- **Tunnel:** Cloudflare Tunnel → `api.shivangiautoclinic.com`
- **Auto-restart:** `cloudflared-tunnel.vbs` (VBS loop, silent, starts on Windows startup)
- **Server restart:** `node index.js` (working directory: `C:\Users\My Pc\Desktop\whatsapp-saas`)
- **Frontend build:** `cd frontend && npm run build` → output goes to `../public/`
- **Push:** `git add -A && git commit && git push origin main`

## Admin Credentials
- **Token:** `ShivangiSaaS@2026` (x-admin-token header)

## Tech Stack
- **Backend:** Node.js + Express (port 3000)
- **Frontend:** React + Vite → built to `public/`
- **WhatsApp:** Baileys (QR/pairing code) + Meta Business Cloud API
- **Database:** lowdb v1 (`data.json`) — uses `id` field (NOT `_id`)
- **AI:** Gemini / OpenAI / Claude / OpenRouter (per-client config)
- **Scheduler:** node-cron

## Key Architecture

### sendMessage() routing (wa-sessions.js)
- Agar client ke paas `metaPhoneNumberId` + `metaAccessToken` → Meta API use karta hai
- Warna → Baileys session

### Single Baileys Session
Ek hi WhatsApp number Baileys pe. Naye clients ke liye Meta Business API recommend karo.

### DB field: `id` not `_id`
lowdb mein `client.id` use hota hai. MongoDB jaisa `_id` nahi hai.

## Key Files
```
index.js                        — Express server entry point
db.js                           — lowdb init + auto-seed (Shivangi Auto Clinic)
data.json                       — runtime DB (gitignored)

routes/
  admin.js                      — Admin CRUD, WA connect, bulk-send, bot-toggle
  client.js                     — Client portal API (login, inbox, meta-config, templates, bulk-send)
  meta-webhook.js               — Meta incoming webhook
  booking.js                    — Leads API

services/
  wa-sessions.js                — Baileys + Meta routing + message handling
  meta-api.js                   — Meta API: sendMessage, getTemplates, sendTemplate
  reporter.js                   — Daily report generator
  ai.js                         — AI wrapper (Gemini/OpenAI/Claude/OpenRouter)
  booking.js                    — Lead system + Firebase + cron

middleware/
  auth.js                       — x-admin-token check
  clientAuth.js                 — x-client-token check

frontend/src/
  App.jsx                       — React Router (routes: /, /client-login, /client-portal, /client/:id/inbox, etc.)
  api.js                        — All API calls (api, leadsApi, clientApi)
  pages/
    AdminDashboard.jsx          — Admin main page, lists all ClientCards
    AddClient.jsx               — Add/Edit client form (all fields including metaWabaId)
    ClientLanding.jsx           — Landing page for clients (hero + login modal) → /client-login
    ClientPortal.jsx            — Client dashboard (tabs: Home, Inbox, Stats, Chats, Report, Prompt, WA Setup, Broadcast)
    InboxPage.jsx               — Admin inbox per client
    LeadsDashboard.jsx          — Leads management
  components/
    ClientCard.jsx              — Admin client card (toggle, edit, portal, inbox, WA connect, broadcast modal)
    ConversationLog.jsx         — Chat log viewer
```

## Admin Panel Features
- Client CRUD (add/edit/delete/toggle active)
- AI provider badge on card (Gemini/GPT-4o/Claude/OpenRouter) — admin only
- WhatsApp connect per client (QR + pairing code)
- Bulk Broadcast: 📢 Broadcast button on card → numbers + message → Meta API send
- Inbox per client (AI Sensy style)
- Leads dashboard

## Client Portal Features (client login at /app/client-login)
Tabs:
1. **Home** — bot status, plan, report send button
2. **💬 Inbox** — full AI Sensy inbox (conversations, chat bubbles, bot toggle, resolve, new chat)
3. **Stats** — total conversations, messages
4. **Chats** — conversation logs
5. **Report** — preview + send
6. **Prompt** — edit system prompt (if permission given)
7. **WA Setup** — Baileys QR/pairing + Meta credentials (Phone ID, Access Token, Verify Token, WABA ID) + Webhook URL + Templates list
8. **📢 Broadcast** — Free Text mode (24h window) OR Approved Template mode (no limit, with variable inputs)

## Client Permissions (set by admin)
- viewStats, viewLogs, toggleBot, sendReport, viewReportPreview, editPrompt

## Broadcast Feature
### Admin (ClientCard.jsx)
- `POST /admin/clients/:id/bulk-send` → numbers array + message → sendMessage() loop, 500ms delay

### Client Portal (ClientPortal.jsx + routes/client.js)
- `POST /client/bulk-send` → same, uses client's own credentials
- `GET /client/templates` → Meta API fetch templates (needs metaWabaId)
- `POST /client/bulk-send-template` → send approved template to multiple numbers

## Template System
- Client saves WABA ID in WA Setup
- Templates tab fetches from `GET /{wabaId}/message_templates` (Meta Graph API v19.0)
- Shows APPROVED / PENDING / REJECTED with color badges
- Broadcast → Template mode: select approved template, fill {{1}} {{2}} variables, send to any number (no 24h limit)

## Meta API Fields per Client
```
metaPhoneNumberId   — phone number ID from Meta App
metaAccessToken     — permanent access token (System User)
metaVerifyToken     — webhook verify token
metaWabaId          — WhatsApp Business Account ID (for templates)
```

## Active Client — Shivangi Auto Clinic
- **Business:** Two-wheeler service center, Surat
- **AI:** Gemini
- **Bot name:** Shivi
- **Owner phone:** 9327363931
- **ID in DB:** auto-seeded on fresh start (db.js)

## Lead System
- Bot captures `[LEAD_READY:naam=X|mobile=X|vehicle=X|area=X|date=X]` marker
- 5-min timer if customer goes silent
- Firebase persistence for leads + WA session

## Scheduled Jobs (IST)
- 7:00 PM — Evening report
- 8:00 AM — Service reminders
- 10:00 AM — Follow-up alerts

## Deploy Process
```bash
cd frontend && npm run build
cd .. && git add -A && git commit -m "message" && git push origin main
# Then restart server: kill node process → node index.js
```

## Common Issues & Fixes
- **530 error:** Cloudflare tunnel died → VBS auto-restart loop fixed it
- **Client portal wrong data:** localStorage clientToken persists → ClientLanding clears token on mount
- **DB field:** Always use `client.id` not `client._id`
- **WaStatus default:** New clients get `waStatus: 'close'` (not 'open')
- **Build output warning:** "outDir not inside project root" → normal, ignore

## Known Limitations
- Single Baileys session (one WA number only via Baileys)
- Conversations not persisted to Firebase (wipe on restart)
- @lid JIDs — real phone not extractable
- Render deployment suspended (using local + Cloudflare tunnel instead)
