# WaFlow — WhatsApp Bot SaaS Platform

## Platform Overview
Multi-client WhatsApp bot SaaS. Admin ek dashboard se multiple clients manage karta hai. Har client ka apna WhatsApp bot hota hai jo AI se automatically customers ko reply karta hai, leads capture karta hai, aur owner ko notify karta hai.

**Branding:** WaFlow (Wa + Flow — color: #818cf8 indigo)

---

## Live URLs
- **Admin Panel:** https://api.shivangiautoclinic.com/app
- **Client Portal:** https://api.shivangiautoclinic.com/app/client-login
- **API Base:** https://api.shivangiautoclinic.com
- **GitHub:** https://github.com/sandipdubey773-glitch/whatsapp-saas

---

## Deployment Setup
- **Server:** Local laptop (Windows 10), Node.js v24
- **Tunnel:** Cloudflare Tunnel → `api.shivangiautoclinic.com`
- **Auto-restart tunnel:** `cloudflared-tunnel.vbs` (VBS loop, silent, starts on Windows startup)
- **Server start:** `node index.js` (working dir: `C:\Users\My Pc\Desktop\whatsapp-saas`)
- **Server log:** `server.log` in project root
- **Frontend build:** `cd frontend && npm run build` → output goes to `../public/`
- **Push:** `git add -A && git commit -m "message" && git push origin main`
- **Restart server:** Kill node process → `node index.js > server.log 2>&1 &`

---

## Admin Credentials
- **Token:** `ShivangiSaaS@2026` (header: `x-admin-token`)

---

## Tech Stack
- **Backend:** Node.js + Express (port 3000)
- **Frontend:** React + Vite → built to `public/` (served as static)
- **WhatsApp:** Baileys (QR/pairing code) + Meta Business Cloud API
- **Database:** lowdb v1 (`data.json`) — uses `id` field (NOT `_id`)
- **AI:** Gemini / Groq / OpenAI / Claude / OpenRouter (per-client config)
- **Auth state:** Firebase Realtime DB (Baileys session persistence)
- **Scheduler:** node-cron (3 jobs)

---

## Key Architecture

### sendMessage() Routing (wa-sessions.js:147)
```
client.metaPhoneNumberId + client.metaAccessToken exist?
  YES → Meta Business API (sendMessage via HTTP)
  NO  → Baileys session (sendMessage via WS socket)
```

### Message Routing — Incoming (bootClientSession)
```
Incoming WA message
  → Is senderPhone === client.ownerPhone?
      YES → handleOwnerChat() — owner trainer + agentic HAAN/NAHI
      NO  → handleMessage()  — customer AI bot
```

### DB — Important Rules
- lowdb v1: use `db.get('collection').find({ id: ... }).value()`
- Field is `client.id` (NOT `client._id`)
- Always call `.write()` after mutations
- Collections: `clients`, `conversations`, `stock`, `stockTransactions`, `pendingActions`
- Re-fetch client after DB writes: `const fresh = _db.get('clients').find({ id: client.id }).value()`

### Sessions (in-memory, RAM)
- `sessions` Map — per-client Baileys socket state
- `leadCapturedConvs` Set — resets on server restart
- `conversationTimers` Map — 5-min lead timers, resets on restart

---

## Key Files
```
index.js                        — Express server entry point
db.js                           — lowdb init + auto-seed (Shivangi Auto Clinic)
data.json                       — runtime DB (gitignored)

routes/
  admin.js                      — Admin CRUD, WA connect, bulk-send, bot-toggle, scan page
  client.js                     — Client portal API (login, inbox, meta-config, templates, bulk-send)
  meta-webhook.js               — Meta incoming webhook handler
  booking.js                    — Leads API (Firebase)

services/
  wa-sessions.js                — Core: Baileys + Meta routing + handleMessage + handleOwnerChat
                                   + Agentic AI + executeAgentAction + Owner Training markers
  meta-api.js                   — Meta API: sendMessage, parseIncoming, getTemplates, sendTemplate
  reporter.js                   — Daily report generator
  ai.js                         — AI wrapper (Gemini/Groq/OpenAI/Claude/OpenRouter)
  booking.js                    — Lead system (parseLead, handleLead, Firebase, cron)
  firebase-auth-state.js        — Baileys session persistence via Firebase

middleware/
  auth.js                       — x-admin-token check
  clientAuth.js                 — x-client-token check (reads token from x-client-token header)

frontend/src/
  App.jsx                       — React Router setup
  api.js                        — All API calls (api=admin, leadsApi=leads, clientApi=client portal)
  pages/
    AdminDashboard.jsx          — Admin main page, lists all ClientCards
    AddClient.jsx               — Add/Edit client form (2-number setup)
    ClientLanding.jsx           — Landing + login modal → redirects to /client-portal
    ClientPortal.jsx            — Client dashboard (8 tabs)
    InboxPage.jsx               — Admin inbox per client
    LeadsDashboard.jsx          — Leads management
  components/
    ClientCard.jsx              — Admin client card (toggle, edit, portal, inbox, WA connect, broadcast)
    ConversationLog.jsx         — Chat log viewer
```

---

## Admin Panel Features
- Client CRUD (add/edit/delete/toggle active/inactive)
- AI provider badge on card (Gemini/Groq/GPT-4o/Claude/OpenRouter)
- WhatsApp connect per client: QR scan + pairing code (`/admin/scan/:id`)
- Bulk Broadcast: numbers + message → sendMessage() loop (500ms delay between sends)
- Inbox per client (AI Sensy style)
- Leads dashboard with Firebase data

---

## Client Portal Features
Login at: `/app/client-login` (username + password → clientToken stored in localStorage)

**8 Tabs:**
1. **Home** — bot status, plan info, send report button
2. **Inbox** — full AI Sensy inbox (conversations list, chat bubbles, bot toggle per conv, resolve, new chat, manual send)
3. **Stats** — total conversations, today conversations, total messages (behind `viewStats` permission)
4. **Chats** — conversation logs (behind `viewLogs` permission)
5. **Report** — preview + send (behind `viewReportPreview` / `sendReport` permissions)
6. **Prompt** — edit system prompt (behind `editPrompt` permission)
7. **WA Setup** — Baileys QR/pairing + Meta credentials (Phone ID, Access Token, Verify Token, WABA ID) + Webhook URL display + Templates list with status badges
8. **Broadcast** — Free Text mode (24h window) OR Approved Template mode (no 24h limit, with variable inputs {{1}} {{2}})

---

## Client Permissions (admin sets these per client)
```js
permissions: {
  viewStats: true/false,
  viewLogs: true/false,
  toggleBot: true/false,
  sendReport: true/false,
  viewReportPreview: true/false,
  editPrompt: true/false,
}
```

---

## Client Fields (DB schema)
```js
{
  id,                     // UUID (lowdb primary key)
  name,                   // Business name
  aiProvider,             // 'gemini' | 'groq' | 'openai' | 'claude' | 'openrouter'
  aiKey,                  // API key for AI provider
  systemPrompt,           // Full system prompt (includes [OWNER RULE]: lines appended by training)
  plan,                   // 'starter' | 'pro'
  status,                 // 'active' | 'inactive'
  ownerPhone,             // Bot training number + HAAN/NAHI notifications (91XXXXXXXXXX)
  reportPhone,            // Daily report recipient (usually same as ownerPhone)
  leadGroup,              // WhatsApp group ID for lead reports
  googleSheetWebhook,     // Google Sheet webhook URL (logs every message)
  clientUsername,         // Client portal login username
  clientPassword,         // Client portal login password
  clientToken,            // Client portal auth token (UUID)
  apiKey,                 // External API key (UUID)
  webhookUrl,             // Custom webhook (optional)
  permissions,            // Object (see above)
  metaPhoneNumberId,      // Meta Business phone number ID
  metaAccessToken,        // Meta permanent system user token
  metaVerifyToken,        // Meta webhook verify token
  metaWabaId,             // WhatsApp Business Account ID (for templates)
  greenApiInstanceId,     // Green API instance (legacy, mostly unused)
  greenApiToken,          // Green API token (legacy)
  businessHoursEnabled,   // true/false
  businessHoursStart,     // "09:00" (IST)
  businessHoursEnd,       // "20:00" (IST)
  businessClosedMessage,  // Message sent when shop is closed
  typingDelayEnabled,     // true = 2s typing indicator before reply
  autoApproveActions,     // string[] — action types that skip HAAN/NAHI (e.g. ['followup'])
  createdAt,              // ISO timestamp
}
```

---

## Two-Number Setup (per client)
Every client needs exactly 2 numbers:
- **Number 1 — Bot Number:** The WhatsApp number the bot runs on (Baileys QR scan or Meta API)
- **Number 2 — Owner Number:** `ownerPhone` — receives lead reports, training chat, HAAN/NAHI prompts

In AddClient form, entering Owner Number auto-fills `ownerPhone`, `reportPhone`, and `leadGroup`.

---

## Lead Capture System
Bot captures structured leads via marker in AI reply:
```
[LEAD_READY:naam=NAME|mobile=10DIGIT|vehicle=VEHICLE|area=AREA|date=YYYY-MM-DD]
```
- This marker is stripped from customer-facing reply
- 5-min silence timer → auto-send lead if customer stops responding
- Lead stored in Firebase + sent to owner via WhatsApp report
- `leadCapturedConvs` Set prevents duplicate captures (resets on server restart)
- `phoneContext` injected into system prompt: bot uses customer's WA number as mobile, doesn't ask again

---

## Agentic AI System
AI can request actions from the owner before executing them.

### Flow
```
Customer message
  → AI generates reply
  → Reply contains [ACTION_REQUEST:type|description|params]?
      YES → Is type in client.autoApproveActions?
              YES → executeAgentAction() immediately
              NO  → Save to pendingActions DB
                    Send HAAN/NAHI prompt to ownerPhone
      NO  → Normal reply sent
```

### ACTION_REQUEST Format (in AI reply)
```
[ACTION_REQUEST:followup|Rahul ko kal reminder bhejein|]
[ACTION_REQUEST:offer|20% discount offer bhejein|]
[ACTION_REQUEST:appointment|Service booking confirm karein|]
```

### HAAN/NAHI Handler (handleOwnerChat)
- Owner sends `HAAN` → last pending action executed → marked 'done'
- Owner sends `NAHI` → last pending action marked 'cancelled'
- If execution fails (WA disconnected etc.) → marked 'failed', owner gets error message

### executeAgentAction (wa-sessions.js:641)
```js
followup → sendMessage(client.id, action.customerPhone, action.description)
offer    → sendMessage(client.id, action.customerPhone, action.description)
appointment → sendMessage(client.id, action.customerPhone, `✅ ${action.description}`)
// After success: marks action as 'done' in pendingActions
```

### pendingActions DB Schema
```js
{
  id,           // short UUID (8 chars)
  clientId,
  type,         // 'followup' | 'offer' | 'appointment'
  description,  // message to send
  params,       // extra params (usually empty)
  customerPhone,// WA number of customer
  status,       // 'pending' | 'done' | 'cancelled' | 'failed'
  createdAt,
}
```

---

## Owner Training System
Owner sends messages from `ownerPhone` to bot number → `handleOwnerChat()` routes to AI trainer.

### Training Markers (AI generates these in reply)
| Marker | Effect |
|--------|--------|
| `[ADD_RULE:rule text]` | Appends `[OWNER RULE]: rule text` to system prompt permanently |
| `[REMOVE_RULE:keyword]` | Removes all `[OWNER RULE]` lines containing keyword |
| `[LIST_RULES]` | Shows owner all saved `[OWNER RULE]` lines |
| `[UPDATE_CAMPAIGN:details]` | Replaces CURRENT CAMPAIGN section in system prompt |
| `[SET_AUTO_APPROVE:actionType]` | Adds actionType to `client.autoApproveActions` (no HAAN/NAHI for this type) |
| `[REMOVE_AUTO_APPROVE:actionType]` | Removes from autoApproveActions (HAAN/NAHI resumes) |
| `[SEND_REPORT]` | Generates and sends report to leadGroup |
| `[SEND_GROUP:message]` | Sends custom message to leadGroup |
| `[GET_LEADS:YYYY-MM-DD]` | Fetches leads for that date from Firebase |
| `[STOCK_IN:location\|PartName\|Qty\|Staff]` | Adds stock |
| `[STOCK_OUT:location\|PartName\|Qty\|Staff]` | Removes stock |

### How Rules Are Stored
`[OWNER RULE]` lines are appended directly to `client.systemPrompt` in DB. They persist across server restarts. Customer bot always sees these rules because they're part of the system prompt.

### Owner Chat Examples
```
Owner: "bot ko yeh rule de: customer ka naam pehle lo, phir price batao"
Bot:   "✅ Rule save ho gaya! Bot ab hamesha isko follow karega."

Owner: "rules batao"
Bot:   "📋 Saved Rules (1):
        1. customer ka naam pehle lo, phir price batao"

Owner: "naam wala rule hata do"
Bot:   "🗑️ Rule hata diya! System prompt se remove ho gaya."

Owner: "followup ke liye permission mat lena"
Bot:   "✅ followup ke liye ab permission nahi lenge — auto hoga."
```

---

## Meta API Integration

### Fields Required
```
metaPhoneNumberId   — phone number ID from Meta Developer App
metaAccessToken     — permanent System User token
metaVerifyToken     — webhook verify token (any string)
metaWabaId          — WhatsApp Business Account ID (for listing templates)
```

### Template System
1. Client adds `metaWabaId` in WA Setup tab
2. Templates tab: fetches from `GET /{wabaId}/message_templates` (Graph API v19.0)
3. Shows APPROVED/PENDING/REJECTED with color badges
4. Broadcast → Template mode: select approved template, fill {{1}} {{2}} vars, send to any number (no 24h limit)

### Webhook URL
Always: `https://api.shivangiautoclinic.com/meta/webhook`

---

## API Routes Reference

### Admin Routes (`x-admin-token: ShivangiSaaS@2026`)
```
GET    /admin/clients                    — List all clients (with waStatus)
POST   /admin/clients                    — Create client
PUT    /admin/clients/:id                — Update client fields (only provided fields)
DELETE /admin/clients/:id                — Delete client + conversations
GET    /admin/clients/:id/logs           — Conversation logs
POST   /admin/clients/:id/toggle         — Toggle active/inactive
POST   /admin/clients/:id/bulk-send      — Broadcast: { numbers[], message }
GET    /admin/scan/:id                   — QR/pairing code page (browser)
GET    /admin/wa-status/:id              — WA connection status
POST   /admin/wa-connect/:id            — Start Baileys session
POST   /admin/wa-disconnect/:id         — Disconnect session
GET    /admin/report/:id                — Generate report
POST   /admin/report/:id                — Send report
```

### Client Routes (`x-client-token: <clientToken>`)
```
POST   /client/login                     — { username, password } → { clientToken, name, permissions }
GET    /client/me                        — Client info + permissions
GET    /client/inbox                     — Conversations list (excludes owner_chat)
POST   /client/send-message              — { to, text } → manual send + save to conv
POST   /client/conversations/:id/bot-toggle  — Toggle bot on/off for conversation
POST   /client/conversations/:id/resolve     — Toggle resolved/open
GET    /client/wa-status                 — { status, qr, pairingCode }
POST   /client/wa-connect                — { phone } → start pairing
GET    /client/meta-config               — { metaPhoneNumberId, metaVerifyToken, metaWabaId, hasAccessToken, webhookUrl }
PUT    /client/meta-config               — Update meta fields
GET    /client/templates                 — Fetch Meta templates (needs metaWabaId)
POST   /client/bulk-send                 — { numbers[], message } → free text broadcast
POST   /client/bulk-send-template        — { numbers[], templateName, language, bodyVars[] }
GET    /client/stats                     — { totalConversations, todayConversations, totalMessages }
GET    /client/logs                      — Conversation logs
GET    /client/prompt                    — { systemPrompt }
PUT    /client/prompt                    — { systemPrompt } → save
GET    /client/report-preview            — { report }
POST   /client/send-report               — Send report to leadGroup
POST   /client/toggle                    — Toggle bot status
```

---

## Business Hours Feature
Per-client, stored in DB:
```js
businessHoursEnabled: true,
businessHoursStart: "09:00",   // IST
businessHoursEnd: "20:00",     // IST
businessClosedMessage: "Humari shop abhi band hai..."
```
When closed: sends `businessClosedMessage` once per 12h per conversation, skips AI.

## Typing Delay Feature
```js
typingDelayEnabled: true
```
When enabled: shows "composing..." for 2 seconds before sending AI reply (Baileys only).

---

## Scheduled Jobs (IST timezone)
- **7:00 PM** — Evening report → sent to `client.reportPhone` + `client.leadGroup`
- **8:00 AM** — Service reminders
- **10:00 AM** — Follow-up alerts

---

## Active Clients in DB

### 1. Shivangi Auto Clinic (auto-seeded)
- **ID:** `a86e53ec-7971-47e3-9274-a0be32cae7ca` (constant in db.js)
- **Business:** Two-wheeler doorstep service, Surat
- **AI:** Gemini
- **Bot:** "Shivi" — speaks Hinglish, promotes AMC plan, 90-day free trial
- **Owner:** 9327363931
- **WA:** Not auto-connected (manual QR needed)

### 2. Maurya Mobile
- **Business:** Mobile retail shop
- **AI:** Groq
- **Owner:** 919054900960
- **WA:** ✅ Auto-connects from Firebase session on every server start
- **Note:** System prompt lacks `[LEAD_READY:]` marker — leads not structured yet

### 3. Alkaline Water
- **WA:** Not connected (manual QR needed)

---

## Deploy Process
```bash
# 1. Build frontend
cd frontend && npm run build

# 2. Push to GitHub
cd .. && git add -A && git commit -m "message" && git push origin main

# 3. Restart server
# Kill node: Stop-Process -Name node -Force (PowerShell)
# Start: node index.js > server.log 2>&1 &
```

---

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Site 530 error | Cloudflare tunnel died → VBS auto-restart should recover; manually run `cloudflared tunnel run shivangi-bot` |
| Client portal wrong data | localStorage clientToken stale → `ClientLanding.jsx` clears token on mount |
| DB field not found | Always use `client.id` not `client._id` |
| New client waStatus wrong | New clients default `waStatus: 'close'` (correct) |
| Build output warning "outDir not inside project root" | Normal, ignore |
| Training rule not saving | Check if AI returned `[ADD_RULE:...]` marker — trainer prompt must be followed |
| HAAN not working | Pending action must exist in DB with `status: 'pending'` for that clientId |
| Meta send failing | Check metaPhoneNumberId and metaAccessToken in client config |
| Maurya Mobile not connecting | Session in Firebase — if corrupted, reconnect via admin panel QR |

---

## Known Limitations
- Single Baileys session per client (one WA number via Baileys — recommend Meta API for new clients)
- Group messaging not supported via Meta API (Baileys only)
- `leadCapturedConvs` Set resets on server restart (minor — just means timer may restart)
- `pendingActions` collection grows over time (no auto-cleanup yet)
- ACTION_REQUEST notification goes to only first ownerPhone if comma-separated
- `@lid` JIDs — real phone not always extractable (WhatsApp privacy feature)
