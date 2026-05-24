# WhatsApp SaaS Platform

Multi-client WhatsApp bot platform. Ek backend pe multiple businesses ke bots chala sako — Gemini / OpenAI / OpenRouter support ke saath.

## Project Structure

```
whatsapp-saas/
├── backend/
│   ├── index.js              # Express server
│   ├── firebase.js           # Firebase Admin SDK
│   ├── middleware/auth.js    # Token-based auth
│   ├── routes/
│   │   ├── admin.js          # CRUD: clients + logs
│   │   └── webhook.js        # WhatsApp incoming messages
│   ├── services/
│   │   ├── ai.js             # Gemini / OpenAI / OpenRouter
│   │   └── whatsapp.js       # WhatsApp API sender
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/            # Login, Dashboard, AddClient, Logs
│   │   ├── components/       # ClientCard, ConversationLog, PromptEditor
│   │   ├── App.jsx
│   │   └── api.js            # Axios calls to backend
│   └── package.json
└── README.md
```

---

## Setup — Local

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# .env fill karo (Firebase credentials + ADMIN_TOKEN)
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend opens at `http://localhost:5173`  
Backend runs at `http://localhost:3000`

---

## Firebase Setup

1. Firebase Console → New Project banao
2. Firestore Database → Enable karo (Native mode)
3. Project Settings → Service Accounts → Generate new private key
4. Download JSON, usme se yeh values nikalo:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

### Firestore Indexes (required)

Firestore Console → Indexes → Composite index banao:

**Collection: conversations**
- Field: `clientId` (Ascending)
- Field: `lastUpdated` (Descending)

---

## WhatsApp Business API Setup

1. Meta Developer Console → App banao
2. WhatsApp → Getting Started → Phone Number ID copy karo
3. Temporary Access Token ya Permanent Token set karo
4. Webhook URL set karo: `https://YOUR_BACKEND_URL/webhook`
5. Verify Token = apna `ADMIN_TOKEN`
6. Subscribe to: `messages`

---

## Railway.app Deployment

### Backend Deploy

```bash
# Railway CLI
npm install -g @railway/cli
railway login
cd backend
railway init
railway up
```

Railway pe yeh Environment Variables set karo:
```
ADMIN_TOKEN=your_secret_token
FIREBASE_PROJECT_ID=xxx
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
PORT=3000
```

Backend URL milegi — copy karo (e.g. `https://your-app.railway.app`)

### Frontend Deploy (Netlify / Vercel)

```bash
cd frontend
# .env.local banao:
echo "VITE_API_URL=https://your-app.railway.app" > .env.local
npm run build
# dist/ folder deploy karo
```

Ya Vercel pe:
```bash
npm install -g vercel
vercel --prod
# VITE_API_URL environment variable set karo in Vercel dashboard
```

---

## API Reference

All routes need header: `x-admin-token: YOUR_ADMIN_TOKEN`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/clients` | List all clients |
| POST | `/admin/clients` | Add new client |
| PUT | `/admin/clients/:id` | Update client |
| DELETE | `/admin/clients/:id` | Delete client |
| POST | `/admin/clients/:id/toggle` | Toggle active/inactive |
| GET | `/admin/clients/:id/logs` | Get conversations |
| GET | `/webhook` | WhatsApp verification |
| POST | `/webhook` | Incoming messages |
| GET | `/health` | Health check |

---

## Client Fields

```json
{
  "name": "Sharma Motors",
  "waPhoneId": "1234567890",
  "waToken": "EAAxxxxx",
  "aiProvider": "gemini",
  "aiKey": "AIzaSyXXXX",
  "systemPrompt": "You are a helpful agent for...",
  "plan": "growth",
  "googleSheetId": "optional"
}
```
