const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const whisper = require('./whisper');
const pino = require('pino');
const axios = require('axios');
const { callAI } = require('./ai');
const booking = require('./booking');
const { useFirebaseAuthState } = require('./firebase-auth-state');
const metaApi = require('./meta-api');

const FB_BASE = 'https://shivangi-auto-clinic-99030-default-rtdb.firebaseio.com';

// --- Per-client session state ---
// sessions: Map<clientId, { sock, connected, qrData, pairingPhone, pairingCodeValue, reconnectAttempts, isBooting }>
const sessions = new Map();

function getSession(clientId) {
  if (!sessions.has(clientId)) {
    sessions.set(clientId, {
      sock: null,
      connected: false,
      qrData: null,
      pairingPhone: null,
      pairingCodeValue: null,
      reconnectAttempts: 0,
      isBooting: false,
    });
  }
  return sessions.get(clientId);
}

// --- Global shared state ---
const lastReply = new Map();
const conversationTimers = new Map();
const leadCapturedConvs = new Set();
const lidPhoneMap = new Map();

let _db = null;

// --- Green API Notification Queue ---
const notifQueues = new Map();
let receiptCounter = Date.now();

function _pushNotif(clientId, payload) {
  if (!notifQueues.has(clientId)) notifQueues.set(clientId, []);
  const q = notifQueues.get(clientId);
  if (q.length >= 100) q.shift();
  q.push({ receiptId: ++receiptCounter, ...payload });
}

function receiveNotification(clientId) {
  return (notifQueues.get(clientId) || [])[0] || null;
}

function deleteNotification(clientId, receiptId) {
  const q = notifQueues.get(clientId);
  if (!q) return false;
  const idx = q.findIndex(n => n.receiptId === Number(receiptId));
  if (idx === -1) return false;
  q.splice(idx, 1);
  return true;
}

function clearNotifications(clientId) {
  notifQueues.set(clientId, []);
}

function setDB(db) { _db = db; }

function getStatus(clientId) {
  if (!clientId) {
    for (const [, s] of sessions) { if (s.connected) return 'open'; }
    return 'close';
  }
  return sessions.get(clientId)?.connected ? 'open' : 'close';
}

function getQRImage(clientId) {
  if (!clientId) {
    for (const [, s] of sessions) { if (s.qrData) return s.qrData; }
    return null;
  }
  return sessions.get(clientId)?.qrData || null;
}

function getPairingCode(clientId) {
  if (!clientId) {
    for (const [, s] of sessions) { if (s.pairingCodeValue) return s.pairingCodeValue; }
    return null;
  }
  return sessions.get(clientId)?.pairingCodeValue || null;
}

function disconnectClient(clientId) {
  const s = sessions.get(clientId);
  if (s?.sock) {
    try { s.sock.end(undefined); } catch(e) {}
    s.sock = null;
    s.connected = false;
  }
}

function getGroups() { return []; }

function setPairingPhone(clientId, phone) {
  const s = getSession(clientId);
  s.pairingPhone = String(phone).replace(/\D/g, '');
  s.pairingCodeValue = null;
}

// --- Cleanup old socket safely ---
function destroySock(clientId) {
  const s = sessions.get(clientId);
  if (!s?.sock) return;
  const old = s.sock;
  s.sock = null;
  try { old.ev.removeAllListeners(); } catch(_) {}
  try { old.ws?.removeAllListeners(); } catch(_) {}
  try { old.end(undefined); } catch(_) {}
  try { old.ws?.close(); } catch(_) {}
}

async function startClient(clientId, phone) {
  const s = getSession(clientId);
  if (phone) {
    s.pairingPhone = String(phone).replace(/\D/g, '');
    s.pairingCodeValue = null;
  }
  destroySock(clientId);
  s.connected = false;
  s.qrData = null;
  s.isBooting = false;
  s.reconnectAttempts = 0;
  await new Promise(r => setTimeout(r, 1000));
  bootClientSession(clientId, _db);
}

function toJID(phone) {
  if (String(phone).includes('@')) return phone;
  const num = String(phone).replace(/\D/g, '');
  const withCode = num.length === 10 ? '91' + num : num;
  return withCode + '@s.whatsapp.net';
}

function toGroupJID(groupId) {
  return groupId.includes('@g.us') ? groupId : groupId + '@g.us';
}

async function sendMessage(clientId, to, text) {
  const client = _db?.get('clients').find({ id: clientId }).value();
  if (client?.metaPhoneNumberId && client?.metaAccessToken) {
    await metaApi.sendMessage(client.metaPhoneNumberId, client.metaAccessToken, to, text);
    return;
  }
  const s = sessions.get(clientId);
  if (!s?.sock || !s?.connected) throw new Error('WhatsApp connected nahi hai — pehle connect karo');
  try {
    await s.sock.sendMessage(toJID(to), { text });
    console.log(`[WA:${clientId}] Sent to`, to);
  } catch (err) {
    console.error(`[WA:${clientId}] sendMessage error:`, err.message);
    throw err;
  }
}

async function sendToGroup(clientId, groupId, text) {
  const client = _db?.get('clients').find({ id: clientId }).value();
  if (client?.metaPhoneNumberId) {
    console.warn('[Meta] Group messaging not supported via Meta API — skipping');
    return;
  }
  const s = sessions.get(clientId);
  if (!s?.sock || !s?.connected) { console.error(`[WA:${clientId}] Not connected — cannot send to group`); return; }
  try {
    await s.sock.sendMessage(toGroupJID(groupId), { text });
    console.log(`[WA:${clientId}] Group sent to`, groupId);
  } catch (err) {
    console.error(`[WA:${clientId}] sendToGroup error:`, err.message);
  }
}

// --- Owner trainer chat ---
// =====================================================
// ONBOARDING WIZARD — First-time owner setup
// =====================================================
function generateOnboardingPrompt(d) {
  const specialSection = d.specialOffer && d.specialOffer.toUpperCase() !== 'SKIP'
    ? `\nSPECIAL OFFER / RULE:\n${d.specialOffer}\n` : '';
  const servicesSection = d.services && d.services.toUpperCase() !== 'SKIP'
    ? `\nMAIN PRODUCTS / SERVICES:\n${d.services}\n` : '';

  return `Aap ${d.businessName} ki professional customer service executive "${d.botName}" hain.
Aap ${d.city} mein ${d.businessType} mein customers ki help karte hain.

BUSINESS INFO:
- Business: ${d.businessName}
- Type: ${d.businessType}
- Location: ${d.city}
- Owner: ${d.ownerName}
- Working Hours: ${d.workingHours}
${servicesSection}
TONE AUR STYLE:
- Hamesha professional aur respectful rahein
- Customer ko "Sir" ya "Ma'am" bolkar address karein — kabhi "bhai" mat bolein
- Hinglish mein baat karein (Hindi + English mix)
- Short, clear aur warm messages bhejein
- Emojis bahut kam use karein
${specialSection}
AAPKA MAIN KAAM:
${d.botJob}

CUSTOMER DETAILS ZAROOR LEIN:
1. Naam
2. Phone number (10 digit)
3. Kya chahiye / kya problem hai
4. Kab chahiye (date)
5. Area / Location

CONVERSATION FLOW:
1. Professional greeting karein
2. Customer ki query sunein
3. Details collect karein
4. Confirm karein ki team jald contact karegi

IMPORTANT RULES:
- Exact price guarantee mat do — "exact price ke liye call/visit karein"
- Complaint aane pe escalate karein — "Owner se baat karayenge"
- Hamesha polite aur helpful rahein
- Working hours ke baad aane wale messages ke liye: "Abhi ${d.workingHours} ke baad hai — kal subah reply karenge"

===================================
LEAD CAPTURE SYSTEM (CRITICAL RULE)
===================================
Jab customer ke paas YAHAN SAB mil jaye:
- Naam
- Phone number (10 digit)
- Kya chahiye / service type
- Date ya "jaldi chahiye"

Tab apni normal reply ke BILKUL END mein, customer-facing text ke BAAD, ek NAYI LINE pe yeh EXACTLY likho:
[LEAD_READY:naam=NAAM|mobile=MOBILE10DIGIT|service=SERVICE|area=AREA|date=YYYY-MM-DD]

Rules:
- Separator PIPE | use karo — comma NAHI
- mobile: SIRF 10 digits, koi space ya symbol nahi
- date: YYYY-MM-DD format mein. System tumhe aaj ki date batayega — usi se calculate karo
- naam: Pehla naam only
- Yeh line customer ko NAHI dikhti — system automatically handle karta hai
- SIRF EK BAAR likho — agar pehle likh chuke ho toh DOBARA MAT LIKHNA`;
}

async function handleOnboarding(client, senderPhone, userText) {
  const step = client.onboardingStep || 0;
  const data = client.onboardingData || {};

  const save = (fields) => {
    _db.get('clients').find({ id: client.id }).assign(fields).write();
  };

  // Step 0 — Pehla message: Welcome + bot ka naam poocho
  if (step === 0) {
    save({ onboardingStep: 1, onboardingData: {} });
    return sendMessage(client.id, senderPhone,
`🙏 *Namaste! Main aapka WaFlow AI Bot hun!*

Main abhi setup nahi hua hun. Chaliye mujhe configure karte hain — bas kuch sawaal poochhna hai!

Yeh setup ek baar hota hai — iske baad main puri tarah ready ho jaunga. 🚀

━━━━━━━━━━━━━━━━━━━━━
*Sawaal 1 / 8*
Mera naam kya rakhna chahte hain aap?
_(jaise: Priya, Aryan, Shivi, Robo, etc.)_`);
  }

  // Step 1 — Bot naam mila → Owner ka naam poocho
  if (step === 1) {
    save({ onboardingStep: 2, onboardingData: { ...data, botName: userText.trim() } });
    return sendMessage(client.id, senderPhone,
`✅ *${userText.trim()}* — bahut accha naam!

━━━━━━━━━━━━━━━━━━━━━
*Sawaal 2 / 8*
Aapka naam kya hai?
_(Owner ya Manager ka naam)_`);
  }

  // Step 2 — Owner naam mila → Business ka naam poocho
  if (step === 2) {
    save({ onboardingStep: 3, onboardingData: { ...data, ownerName: userText.trim() } });
    return sendMessage(client.id, senderPhone,
`Bahut accha, *${userText.trim()} sir/ma'am*! 😊

━━━━━━━━━━━━━━━━━━━━━
*Sawaal 3 / 8*
Aapke business ka naam kya hai?`);
  }

  // Step 3 — Business naam mila → Business type + city
  if (step === 3) {
    save({ onboardingStep: 4, onboardingData: { ...data, businessName: userText.trim() } });
    return sendMessage(client.id, senderPhone,
`✅ *${userText.trim()}* — note ho gaya!

━━━━━━━━━━━━━━━━━━━━━
*Sawaal 4 / 8*
Aap kya karte hain aur aapka business kahan hai?

Dono ek saath batayein:
_(jaise: "Mobile repair shop, Surat Adajan" ya "Bike service center, Mumbai Andheri")_`);
  }

  // Step 4 — Business type + city mili → Working hours poocho
  if (step === 4) {
    const parts = userText.trim().split(',');
    const businessType = parts[0]?.trim() || userText.trim();
    const city = parts.slice(1).join(',').trim() || 'Not specified';
    save({ onboardingStep: 5, onboardingData: { ...data, businessType, city } });
    return sendMessage(client.id, senderPhone,
`Got it! *${businessType}* in *${city}*. 👍

━━━━━━━━━━━━━━━━━━━━━
*Sawaal 5 / 8*
Aapki shop / office ke working hours kya hain?

_(jaise: "Subah 10 baje se Raat 8 baje tak, Sunday off" ya "24/7 available")_`);
  }

  // Step 5 — Working hours mili → Main services/products poocho
  if (step === 5) {
    save({ onboardingStep: 6, onboardingData: { ...data, workingHours: userText.trim() } });
    return sendMessage(client.id, senderPhone,
`✅ Working hours noted: *${userText.trim()}*

━━━━━━━━━━━━━━━━━━━━━
*Sawaal 6 / 8*
Aapke main products / services kya hain?

Price range bhi batayein agar ho:
_(jaise: "Bike servicing Rs.300-800, Oil change Rs.150, Tyre puncture Rs.50")_

_SKIP likho agar abhi nahi batana_`);
  }

  // Step 6 — Services mili → Bot ka main kaam poocho
  if (step === 6) {
    save({ onboardingStep: 7, onboardingData: { ...data, services: userText.trim() } });
    return sendMessage(client.id, senderPhone,
`✅ Services note ho gayi!

━━━━━━━━━━━━━━━━━━━━━
*Sawaal 7 / 8*
Mujhe mainly kya karna hai? Customers ke saath main kya kaam karunga?

_(jaise: "Leads lena — naam, number, kya chahiye", "Appointments book karna", "Queries answer karna aur info dena", ya sab ek saath)_`);
  }

  // Step 7 — Bot job mili → Special rules/offer poocho
  if (step === 7) {
    save({ onboardingStep: 8, onboardingData: { ...data, botJob: userText.trim() } });
    return sendMessage(client.id, senderPhone,
`✅ Main kaam samajh gaya: *${userText.trim()}*

━━━━━━━━━━━━━━━━━━━━━
*Sawaal 8 / 8 (Optional)*
Koi special offer, discount, ya important rule hai jo customers ko pehle batana chahiye?

_(jaise: "Pehli service FREE hai", "10% student discount", "Ghar pe service available hai")_

_SKIP likho agar kuch nahi hai_`);
  }

  // Step 8 — Sab kuch mila → System prompt generate karo
  if (step === 8) {
    const finalData = { ...data, specialOffer: userText.trim() };
    const newPrompt = generateOnboardingPrompt(finalData);

    save({
      onboardingComplete: true,
      onboardingStep: null,
      onboardingData: finalData,
      systemPrompt: newPrompt,
      name: finalData.businessName || client.name,
    });

    const servicesLine = finalData.services && finalData.services.toUpperCase() !== 'SKIP'
      ? `\n- ⚙️ Services: ${finalData.services.slice(0, 60)}${finalData.services.length > 60 ? '...' : ''}` : '';
    const offerLine = finalData.specialOffer && finalData.specialOffer.toUpperCase() !== 'SKIP'
      ? `\n- ⭐ Special: ${finalData.specialOffer}` : '';

    return sendMessage(client.id, senderPhone,
`🎉 *Setup Complete! Main bilkul ready hun!*

━━━━━━━━━━━━━━━━━━━━━
📌 *Meri Details:*
- 🤖 Mera naam: *${finalData.botName}*
- 👤 Owner: *${finalData.ownerName} sir/ma'am*
- 🏢 Business: *${finalData.businessName}*
- 💼 Type: ${finalData.businessType}
- 📍 Location: ${finalData.city}
- 🕒 Hours: ${finalData.workingHours}${servicesLine}
- 🎯 Kaam: ${finalData.botJob}${offerLine}
━━━━━━━━━━━━━━━━━━━━━

Ab main customers ko professionally handle kar sakta hun! 🚀

*Kuch aur update karna ho toh mujhse kaho — main yaad rakhta hun!*
_(jaise: "bot ko yeh rule de...", "aaj ke leads batao", "appointments dikhao")_`);
  }
}

async function handleOwnerChat(client, senderPhone, userText) {

  // Onboarding check — naya client setup nahi hua
  if (client.onboardingComplete === false) {
    return await handleOnboarding(client, senderPhone, userText);
  }

  // HAAN / NAHI — pending action reply
  const upperText = userText.trim().toUpperCase();
  if (upperText === 'HAAN' || upperText.startsWith('HAAN ')) {
    const pending = _db.get('pendingActions').filter({ clientId: client.id, status: 'pending' }).value();
    if (pending.length > 0) {
      const action = pending[pending.length - 1];
      try {
        await executeAgentAction(client, action);
        await sendMessage(client.id, senderPhone, `✅ Done! *${action.type}* action execute ho gaya.`);
      } catch (e) {
        _db.get('pendingActions').find({ id: action.id }).assign({ status: 'failed' }).write();
        await sendMessage(client.id, senderPhone, `❌ Action execute nahi hua: ${e.message}`);
      }
      return;
    }
  }
  if (upperText === 'NAHI' || upperText.startsWith('NAHI ')) {
    const pending = _db.get('pendingActions').filter({ clientId: client.id, status: 'pending' }).value();
    if (pending.length > 0) {
      const action = pending[pending.length - 1];
      _db.get('pendingActions').find({ id: action.id }).assign({ status: 'cancelled' }).write();
      await sendMessage(client.id, senderPhone, `❌ *${action.type}* action cancel kar diya.`);
      return;
    }
  }

  const db = _db;
  const leads     = booking.getTodayBookings(client.id);
  const called    = leads.filter(l => l.called).length;
  const done      = leads.filter(l => l.serviceDone).length;
  const pending   = leads.filter(l => !l.called).length;
  const allLeads  = booking.getAllLeads(client.id, 20);

  const statsText  = `Aaj ke leads: ${leads.length} total, ${pending} call baaki, ${called} called, ${done} done.`;
  const recentText = allLeads.slice(0, 5).map(l => `${l.naam} - ${l.mobile} - ${l.vehicle} - ${l.area} - ${l.assignedDate}`).join('\n') || 'Koi lead nahi';
  const campaignMatch = client.systemPrompt.match(/CURRENT CAMPAIGN[\s\S]*?\n([\s\S]*?)(?:═|$)/);
  const currentCampaign = campaignMatch ? campaignMatch[1].trim() : 'Koi campaign set nahi';

  const allStock = _db.get('stock').filter({ clientId: client.id }).value();
  const workshopStock = allStock.filter(s => s.location === 'workshop');
  const showroomStock = allStock.filter(s => s.location === 'showroom');
  const fmtStock = arr => arr.length ? arr.map(s => `  ${s.partName}: ${s.qty}${s.qty === 0 ? ' 🚨KHATAM' : ''}`).join('\n') : '  (khali)';
  const stockText = `🔧 Workshop:\n${fmtStock(workshopStock)}\n🏪 Showroom:\n${fmtStock(showroomStock)}`;
  const todayTxns = _db.get('stockTransactions').filter({ clientId: client.id }).value()
    .filter(t => t.timestamp.startsWith(new Date().toISOString().slice(0, 10)));
  const txnText = todayTxns.length
    ? todayTxns.map(t => `${t.type} | ${t.partName} | ${t.qty} | ${t.staffName} | ${t.location}`).join('\n')
    : 'Aaj koi transaction nahi';

  const TRAINER_PROMPT = `Tu "${client.name}" ke WhatsApp bot ka trainer hai.
Owner tujhse seedha baat karta hai — bilkul normal conversation mein.

TU KYA KAR SAKTA HAI:
1. Bot ki campaign update kar
2. Bot ko naye rules de
3. Aaj ke leads/stats batao
4. Koi bhi sawaal ka jawab do
5. Owner jo kahein woh message team group mein bhejo

CURRENT BOT INFO:
- Business: ${client.name}
- Current campaign: ${currentCampaign}

TODAY STATS:
${statsText}

RECENT LEADS:
${recentText}

CURRENT STOCK:
${stockText}

AAJ KI TRANSACTIONS:
${txnText}

REPLY RULES:
- Hamesha Hinglish mein baat kar
- Short aur clear jawab de
- Agar owner campaign update kare: [UPDATE_CAMPAIGN:details]
- Agar owner naya rule/instruction save karna chahe (jaise "bot ko yeh rule de", "hamesha ke liye save karo", "yeh sikhao bot ko"): [ADD_RULE:exact rule text]
- Agar owner rule hatana chahe (jaise "followup wala rule hata do", "yeh rule delete karo"): [REMOVE_RULE:keyword]
  Note: keyword woh word likho jo us rule mein hai
- Agar owner saved rules dekhna chahe (jaise "rules batao", "kya rules hain", "kya sikha hai"): [LIST_RULES]
- Agar "group mein daal": [SEND_META_LEADS_TO_GROUP]
- Agar "report do": [SEND_REPORT]
- Agar owner koi bhi message group mein bhejne ko kahe (jaise "group mein likho: Aaj band hai"): [SEND_GROUP:exact message here]
  Note: [SEND_GROUP:...] ke andar owner ka exact message likho, koi extra text mat add karo
- Agar owner kisi date ki leads maange (jaise "aaj ki leads", "kal ki leads", "15 may ki leads", "leads batao"): [GET_LEADS:YYYY-MM-DD]
  Note: Date ko YYYY-MM-DD format mein likho. "Aaj" = today, "Kal" = yesterday (wo jo guzar gaya), "Parso" = 2 din pehle
- Agar owner appointments dekhna chahe (jaise "aaj ke appointments", "kal ki bookings"): [GET_APPOINTMENTS:YYYY-MM-DD]
- Agar owner appointment cancel karna chahe: [CANCEL_APPOINTMENT:appointmentId]
- Agar owner stock ke baare mein pooche (jaise "stock batao", "kitna stock hai", "kya khatam hai"): CURRENT STOCK section se seedha jawab de — koi marker nahi chahiye
- Agar owner stock ADD kare (jaise "workshop mein 10 engine oil add karo", "showroom mein 2 FZ-S aaye"): [STOCK_IN:location|Part Name|Qty|Owner]
  Note: location = "workshop" ya "showroom". Part Name exact likho.
- Agar owner stock NIKALE (jaise "workshop se 2 air filter gaya", "showroom se R15 1 bika"): [STOCK_OUT:location|Part Name|Qty|Owner]
  Note: location = "workshop" ya "showroom". Part Name exact likho.

AUTO-APPROVE RULES:
- Agar owner bole "X ke liye permission mat lena" ya "X automatically karo": [SET_AUTO_APPROVE:X]
  Example: "followup ke liye permission mat lena" → [SET_AUTO_APPROVE:followup]
- Agar owner bole "X ke liye permission lo" ya "X se pehle poocho": [REMOVE_AUTO_APPROVE:X]
  Example: "offer se pehle poocho" → [REMOVE_AUTO_APPROVE:offer]
- HAAN/NAHI replies system automatically handle karta hai — tum normal baat karo.

SABSE IMPORTANT RULE — JO NAHI KAR SAKTA:
Agar owner kuch aisa maange jo upar ke kisi bhi marker se possible NAHI hai (koi naya feature, integration, capability jo system mein exist nahi karti), toh clearly aur seedha bolo:
"Sir, yeh kaam main abhi nahi kar sakta. Iske liye *Sandeep sir* (developer) se request karein — woh mujhe update kar denge. 🙏"
Yeh mat karo: confuse karo, galat marker use karo, ya seedha mana karo bina explanation ke.
Jo kaam kar sakta hai woh karo — jo nahi kar sakta woh honestly bolo.`;

  try {
    const ownerConvId = `${client.id}_owner_chat`;
    let ownerConv = db.get('conversations').find({ id: ownerConvId }).value();
    let messages = ownerConv?.messages || [];
    messages.push({ role: 'user', content: userText, timestamp: new Date().toISOString() });
    if (messages.length > 20) messages = messages.slice(-20);

    const sess = sessions.get(client.id);
    if (sess?.sock && sess?.connected) {
      sess.sock.sendPresenceUpdate('composing', toJID(senderPhone)).catch(() => {});
    }

    const aiReply = await callAI({
      provider: client.aiProvider,
      apiKey: client.aiKey,
      systemPrompt: TRAINER_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    messages.push({ role: 'assistant', content: aiReply, timestamp: new Date().toISOString() });
    const convData = { id: ownerConvId, clientId: client.id, messages, lastUpdated: new Date().toISOString() };
    if (ownerConv) db.get('conversations').find({ id: ownerConvId }).assign(convData).write();
    else db.get('conversations').push(convData).write();

    let cleanReply = aiReply;
    const freshClient = () => _db.get('clients').find({ id: client.id }).value();

    const campaignMatch2 = aiReply.match(/\[UPDATE_CAMPAIGN:([\s\S]*?)\]/);
    if (campaignMatch2) {
      const newCampaign = campaignMatch2[1].trim();
      let prompt = freshClient().systemPrompt.replace(/\n\n═+\nCURRENT CAMPAIGN[\s\S]*?(?=\n\n═|$)/g, '').trim();
      prompt += `\n\n═══════════════════════════════════\nCURRENT CAMPAIGN (YAD RAKHO)\n═══════════════════════════════════\n${newCampaign}\n\nCustomer isi campaign se aa raha hai — yeh context hamesha use karo.`;
      db.get('clients').find({ id: client.id }).assign({ systemPrompt: prompt }).write();
      cleanReply = cleanReply.replace(/\[UPDATE_CAMPAIGN:[\s\S]*?\]/g, '').trim();
    }

    const ruleMatch = aiReply.match(/\[ADD_RULE:([\s\S]*?)\]/);
    if (ruleMatch) {
      const newRule = ruleMatch[1].trim();
      const prompt = freshClient().systemPrompt + `\n\n[OWNER RULE]: ${newRule}`;
      db.get('clients').find({ id: client.id }).assign({ systemPrompt: prompt }).write();
      cleanReply = cleanReply.replace(/\[ADD_RULE:[\s\S]*?\]/g, '').trim();
      cleanReply += `\n\n✅ *Rule save ho gaya!* Bot ab hamesha isko follow karega.`;
    }

    const removeRuleMatch = aiReply.match(/\[REMOVE_RULE:([^\]]+)\]/);
    if (removeRuleMatch) {
      const keyword = removeRuleMatch[1].trim().toLowerCase();
      const lines = freshClient().systemPrompt.split('\n');
      const filtered = lines.filter(line => !(line.startsWith('[OWNER RULE]:') && line.toLowerCase().includes(keyword)));
      const newPrompt = filtered.join('\n').trim();
      _db.get('clients').find({ id: client.id }).assign({ systemPrompt: newPrompt }).write();
      cleanReply = cleanReply.replace(/\[REMOVE_RULE:[^\]]+\]/g, '').trim();
      cleanReply += `\n\n🗑️ *Rule hata diya!* System prompt se remove ho gaya.`;
    }

    if (aiReply.includes('[LIST_RULES]')) {
      cleanReply = cleanReply.replace(/\[LIST_RULES\]/g, '').trim();
      const savedRules = freshClient().systemPrompt.split('\n').filter(l => l.startsWith('[OWNER RULE]:'));
      if (savedRules.length === 0) {
        cleanReply += `\n\n📋 Abhi koi saved rule nahi hai.`;
      } else {
        const ruleLines = savedRules.map((r, i) => `${i + 1}. ${r.replace('[OWNER RULE]:', '').trim()}`).join('\n');
        cleanReply += `\n\n📋 *Saved Rules (${savedRules.length}):*\n${ruleLines}`;
      }
    }

    const getLeadsMatch = aiReply.match(/\[GET_LEADS:(\d{4}-\d{2}-\d{2})\]/);
    if (getLeadsMatch) {
      cleanReply = cleanReply.replace(/\[GET_LEADS:[\s\S]*?\]/g, '').trim();
      const date = getLeadsMatch[1];
      const dayLeads = booking.getLeadsByDate(client.id, date);
      if (dayLeads.length === 0) {
        await sendMessage(client.id, senderPhone, `📅 *${date}* ko koi lead nahi aaya.`);
      } else {
        const calledC   = dayLeads.filter(l => l.called).length;
        const feedbackC = dayLeads.filter(l => l.feedbackGiven).length;
        const pendingC  = dayLeads.filter(l => !l.called).length;
        const lines = dayLeads.map(l => {
          const icon = l.feedbackGiven ? '✅' : l.called ? '📞' : '❌';
          const callNum = l.callNumber || l.mobile || '—';
          const fb = l.feedbackGiven ? `\n   💬 ${l.feedback}` : l.called ? '\n   ⏳ Feedback baaki' : '\n   ❌ Call baaki';
          return `${icon} *Lead ${l.leadNum}:* ${l.naam || callNum}\n   📞 ${callNum} | 🏍️ ${l.vehicle || '—'}${fb}`;
        }).join('\n\n');
        const msg = `📋 *${date} ki Leads — ${dayLeads.length} total*\n📞 Called: ${calledC} | 💬 Feedback: ${feedbackC} | ❌ Baaki: ${pendingC}\n━━━━━━━━━━━━━━━━━━━━━\n\n${lines}`;
        await sendMessage(client.id, senderPhone, msg);
      }
    }

    const getAptMatch = aiReply.match(/\[GET_APPOINTMENTS:(\d{4}-\d{2}-\d{2})\]/);
    if (getAptMatch) {
      cleanReply = cleanReply.replace(/\[GET_APPOINTMENTS:[^\]]+\]/g, '').trim();
      const aptDate = getAptMatch[1];
      const apts = _db.get('appointments').filter({ clientId: client.id, date: aptDate }).value().filter(a => a.status !== 'cancelled');
      if (apts.length === 0) {
        cleanReply += `\n\n📅 *${aptDate}* ko koi appointment nahi hai.`;
      } else {
        const lines = apts.map((a, i) => `${i + 1}. *${a.time}* — ${a.customerName} — ${a.description}\n   📞 ${a.customerPhone}`).join('\n\n');
        cleanReply += `\n\n📅 *${aptDate} ke Appointments (${apts.length}):*\n${lines}`;
      }
    }

    const cancelAptMatch = aiReply.match(/\[CANCEL_APPOINTMENT:([^\]]+)\]/);
    if (cancelAptMatch) {
      cleanReply = cleanReply.replace(/\[CANCEL_APPOINTMENT:[^\]]+\]/g, '').trim();
      const aptId = cancelAptMatch[1].trim();
      const apt = _db.get('appointments').find({ id: aptId, clientId: client.id }).value();
      if (apt) {
        _db.get('appointments').find({ id: aptId }).assign({ status: 'cancelled' }).write();
        cleanReply += `\n\n🗑️ Appointment cancel kar diya: ${apt.customerName} — ${apt.date} ${apt.time}`;
      } else {
        cleanReply += `\n\n❌ Appointment ID nahi mila: ${aptId}`;
      }
    }

    if (aiReply.includes('[SEND_REPORT]')) {
      cleanReply = cleanReply.replace(/\[SEND_REPORT\]/g, '').trim();
      const reporter = require('./reporter');
      const report = reporter.generateReport(client.id, 'manual');
      if (report) {
        if (client.leadGroup) await sendToGroup(client.id, client.leadGroup, report);
        await sendMessage(client.id, senderPhone, '📊 Report group mein bhej diya!');
        console.log('[Owner] Report sent to group by owner request');
      }
    }

    if (aiReply.includes('[SEND_SHEET]')) {
      cleanReply = cleanReply.replace(/\[SEND_SHEET\]/g, '').trim();
      if (client.googleSheetWebhook) {
        await sendMessage(client.id, senderPhone, `📊 *Google Sheet:* ${client.googleSheetWebhook}`);
      }
    }

    const sendGroupMatch = aiReply.match(/\[SEND_GROUP:([\s\S]*?)\]/);
    if (sendGroupMatch) {
      cleanReply = cleanReply.replace(/\[SEND_GROUP:[\s\S]*?\]/g, '').trim();
      const groupMsg = sendGroupMatch[1].trim();
      if (client.leadGroup && groupMsg) {
        await sendToGroup(client.id, client.leadGroup, groupMsg);
        console.log('[Owner] Custom group message sent:', groupMsg.slice(0, 50));
      }
    }

    const stockInMatches = [...aiReply.matchAll(/\[STOCK_IN:(\w+)\|([^|]+)\|(\d+)\|([^\]]+)\]/g)];
    for (const m of stockInMatches) {
      const [, loc, partName, qtyStr, staffName] = m;
      const qty = parseInt(qtyStr);
      const location = loc.toLowerCase();
      const existing = _db.get('stock').find({ clientId: client.id, partName: partName.trim(), location }).value();
      if (existing) {
        _db.get('stock').find({ clientId: client.id, partName: partName.trim(), location }).assign({ qty: existing.qty + qty, updatedAt: new Date().toISOString() }).write();
      } else {
        _db.get('stock').push({ id: Date.now().toString(), clientId: client.id, partName: partName.trim(), qty, location, updatedAt: new Date().toISOString() }).write();
      }
      _db.get('stockTransactions').push({ id: Date.now().toString(), clientId: client.id, type: 'IN', partName: partName.trim(), qty, staffName: staffName.trim(), location, timestamp: new Date().toISOString() }).write();
      const inFinalQty = _db.get('stock').find({ clientId: client.id, partName: partName.trim(), location }).value()?.qty || qty;
      fireStockSheet(client, { type: 'IN', partName: partName.trim(), qty, staffName: staffName.trim(), location, currentQty: inFinalQty });
      console.log('[Stock] Owner IN:', partName.trim(), qty, location);
    }
    cleanReply = cleanReply.replace(/\[STOCK_IN:[^\]]+\]/g, '').trim();

    const stockOutMatches = [...aiReply.matchAll(/\[STOCK_OUT:(\w+)\|([^|]+)\|(\d+)\|([^\]]+)\]/g)];
    for (const m of stockOutMatches) {
      const [, loc, partName, qtyStr, staffName] = m;
      const qty = parseInt(qtyStr);
      const location = loc.toLowerCase();
      const existing = _db.get('stock').find({ clientId: client.id, partName: partName.trim(), location }).value();
      if (!existing || existing.qty < qty) {
        await sendMessage(client.id, senderPhone, `⚠️ *${partName.trim()}* (${location}) mein sirf ${existing?.qty || 0} units hain.`);
        continue;
      }
      const newQty = existing.qty - qty;
      _db.get('stock').find({ clientId: client.id, partName: partName.trim(), location }).assign({ qty: newQty, updatedAt: new Date().toISOString() }).write();
      _db.get('stockTransactions').push({ id: Date.now().toString(), clientId: client.id, type: 'OUT', partName: partName.trim(), qty, staffName: staffName.trim(), location, timestamp: new Date().toISOString() }).write();
      if (newQty === 0) await sendMessage(client.id, senderPhone, `🚨 *${partName.trim()}* (${location}) STOCK KHATAM!`);
      fireStockSheet(client, { type: 'OUT', partName: partName.trim(), qty, staffName: staffName.trim(), location, currentQty: newQty });
      console.log('[Stock] Owner OUT:', partName.trim(), qty, location);
    }
    cleanReply = cleanReply.replace(/\[STOCK_OUT:[^\]]+\]/g, '').trim();

    if (aiReply.includes('[SEND_META_LEADS_TO_GROUP]')) {
      cleanReply = cleanReply.replace(/\[SEND_META_LEADS_TO_GROUP\]/g, '').trim();
      try {
        const data = booking.loadData();
        const metaLeads = data.leads.filter(l => l.clientId === client.id && l.source === 'meta_ads');
        const calledCount = metaLeads.filter(l => l.called).length;
        const pendingLeads = metaLeads.filter(l => !l.called);
        const lines = metaLeads.map((l, i) => `${l.called ? '✅' : '❌'} ${i+1}. ${l.mobile} ${l.naam.replace('Meta Lead ','#')}`).join('\n');
        const groupMsg = `📋 *Meta Ads Calling List*\n━━━━━━━━━━━━━━━━━━━━━\nTotal: ${metaLeads.length} | ✅ Called: ${calledCount} | ❌ Baaki: ${pendingLeads.length}\n\n${lines}`;
        if (client.leadGroup) await sendToGroup(client.id, client.leadGroup, groupMsg);
      } catch (e) { console.error('[Owner] Group send error:', e.message); }
    }

    // Auto-approve set/remove
    const setAutoMatch = aiReply.match(/\[SET_AUTO_APPROVE:([^\]]+)\]/);
    if (setAutoMatch) {
      const actionType = setAutoMatch[1].trim();
      const current = client.autoApproveActions || [];
      if (!current.includes(actionType)) {
        _db.get('clients').find({ id: client.id }).assign({ autoApproveActions: [...current, actionType] }).write();
      }
      cleanReply = cleanReply.replace(/\[SET_AUTO_APPROVE:[^\]]+\]/g, '').trim();
      cleanReply += `\n✅ *${actionType}* ke liye ab permission nahi lenge — auto hoga.`;
    }
    const removeAutoMatch = aiReply.match(/\[REMOVE_AUTO_APPROVE:([^\]]+)\]/);
    if (removeAutoMatch) {
      const actionType = removeAutoMatch[1].trim();
      const current = (client.autoApproveActions || []).filter(a => a !== actionType);
      _db.get('clients').find({ id: client.id }).assign({ autoApproveActions: current }).write();
      cleanReply = cleanReply.replace(/\[REMOVE_AUTO_APPROVE:[^\]]+\]/g, '').trim();
      cleanReply += `\n🔔 *${actionType}* ke liye ab permission lenge.`;
    }

    await sendMessage(client.id, senderPhone, cleanReply || aiReply);
    console.log('[Owner] Trainer AI replied to', senderPhone);
  } catch (err) {
    console.error('[Owner] error:', err.message);
    await sendMessage(client.id, senderPhone, 'Error aaya: ' + err.message);
  }
}

// --- Customer chat ---
async function handleMessage(client, senderPhone, userText, imageData = null) {
  if (!_db) return;
  try {
    const convId = `${client.id}_${senderPhone}`;

    const convCheck = _db.get('conversations').find({ id: convId }).value();
    if (convCheck?.botEnabled === false) {
      const messages = [...(convCheck.messages || []), { role: 'user', content: userText, timestamp: new Date().toISOString() }];
      _db.get('conversations').find({ id: convId }).assign({ messages, lastUpdated: new Date().toISOString() }).write();
      console.log('[WA] Bot disabled for', senderPhone, '— message stored, no AI reply');
      return;
    }
    let conv = _db.get('conversations').find({ id: convId }).value();

    if (!conv) {
      const oldId = `${client.id}_${senderPhone}@c.us`;
      const oldConv = _db.get('conversations').find({ id: oldId }).value();
      if (oldConv) {
        _db.get('conversations').find({ id: oldId }).assign({ id: convId }).write();
        conv = _db.get('conversations').find({ id: convId }).value();
      }
    }

    if (!leadCapturedConvs.has(convId)) {
      if (conversationTimers.has(convId)) clearTimeout(conversationTimers.get(convId));
      const timer = setTimeout(() => autoSendLeadFromTimer(client, senderPhone, convId), 5 * 60 * 1000);
      conversationTimers.set(convId, timer);
      console.log('[WA] 5-min timer (re)started for', senderPhone);
    }

    let messages = conv?.messages || [];
    messages.push({ role: 'user', content: userText, timestamp: new Date().toISOString() });
    if (messages.length > 20) messages = messages.slice(-20);

    if (client.businessHoursEnabled && client.businessHoursStart && client.businessHoursEnd) {
      const options = { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false, minute: 'numeric' };
      const [currH, currM] = new Intl.DateTimeFormat('en-US', options).format(new Date()).split(':').map(Number);
      const [startH, startM] = client.businessHoursStart.split(':').map(Number);
      const [endH, endM] = client.businessHoursEnd.split(':').map(Number);
      const currentMins = currH * 60 + currM;
      const startMins = startH * 60 + startM;
      const endMins = endH * 60 + endM;
      const isClosed = currentMins < startMins || currentMins >= endMins;
      if (isClosed) {
        const nowTs = Date.now();
        const lastAwayMsg = lastReply.get(convId + '_away') || 0;
        if (nowTs - lastAwayMsg > 12 * 60 * 60 * 1000) {
          const closedMsg = client.businessClosedMessage || "Humari shop abhi band hai. Hum kal subah open hote hi aapko reply karenge.";
          await sendMessage(client.id, senderPhone, closedMsg);
          lastReply.set(convId + '_away', nowTs);
        }
        console.log('[WA] Shop closed. Skipped AI for', senderPhone);
        return;
      }
    }

    const todayStr    = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const dateContext = `\n\n[SYSTEM: Aaj ki date hai ${todayStr}. "Kal" matlab ${tomorrowStr}. Date hamesha YYYY-MM-DD format mein likho.]`;
    const autoApproved = (client.autoApproveActions || []).join(', ') || 'koi nahi';
    const agentContext = `\n\n[SYSTEM: Agar tum koi action lena chahte ho (followup, offer, appointment), toh is format mein likho: [ACTION_REQUEST:type|description|params] — Auto-approved actions: ${autoApproved}
Appointment book karne ke liye: [BOOK_SLOT:YYYY-MM-DD|HH:MM|CustomerName|Service Description]
Agar customer frustrated/angry/upset lage: [SENTIMENT:negative|reason in 10 words]]`;

    const todayApts = _db.get('appointments').filter({ clientId: client.id }).value()
      .filter(a => a.date === todayStr && a.status !== 'cancelled');
    const aptContext = todayApts.length > 0
      ? `\n\n[SYSTEM: Aaj ke booked slots: ${todayApts.map(a => `${a.time}(${a.customerName})`).join(', ')}. Naya slot book karo is format mein: [BOOK_SLOT:date|time|naam|description]]`
      : `\n\n[SYSTEM: Aaj koi appointment nahi hai. Slot book karne ke liye: [BOOK_SLOT:date|time|naam|description]]`;
    const alreadyCaptured = messages.some(m => m.role === 'assistant' && m.content.includes('[LEAD_READY:'));
    const noLeadInstruction = alreadyCaptured ? '\n\n[SYSTEM: Lead pehle hi capture ho chuka hai — LEAD_READY marker DOBARA MAT LIKHO.]' : '';
    const cleanCustomerPhone = senderPhone.replace(/\D/g, '');
    const phoneContext = `\n\n[SYSTEM: Is customer ka WhatsApp number ${cleanCustomerPhone} hai. Tumhe inse inka phone number NAHI poochna hai. Jab lead capture karo, toh 'mobile' field mein ${cleanCustomerPhone} hi likhna.]`;

    const sess = sessions.get(client.id);
    if (sess?.sock && sess?.connected) {
      sess.sock.sendPresenceUpdate('composing', toJID(senderPhone)).catch(() => {});
    }

    const aiReply = await callAI({
      provider: client.aiProvider,
      apiKey: client.aiKey,
      systemPrompt: client.systemPrompt + dateContext + noLeadInstruction + phoneContext + agentContext + aptContext,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      imageData,
    });

    messages.push({ role: 'assistant', content: aiReply, timestamp: new Date().toISOString() });
    const convData = { id: convId, clientId: client.id, clientName: client.name, userPhone: senderPhone, messages, lastUpdated: new Date().toISOString() };
    if (conv) _db.get('conversations').find({ id: convId }).assign(convData).write();
    else _db.get('conversations').push(convData).write();

    const leadMarker = booking.parseLead(aiReply);
    let cleanReply = aiReply
      .replace(/\[LEAD_READY:[^\]]+\]/g, '')
      .replace(/\[BOOK_SLOT:[^\]]+\]/g, '')
      .replace(/\[SENTIMENT:[^\]]+\]/g, '')
      .replace(/\[ACTION_REQUEST:[^\]]+\]/g, '')
      .trim();

    if (cleanReply) {
      if (client.typingDelayEnabled && sess?.sock && sess?.connected) {
        try {
          await sess.sock.sendPresenceUpdate('composing', toJID(senderPhone));
          await new Promise(r => setTimeout(r, 2000));
          await sess.sock.sendPresenceUpdate('paused', toJID(senderPhone));
        } catch (e) { /* ignore */ }
      }
      await sendMessage(client.id, senderPhone, cleanReply);
    }
    console.log('[WA] Replied to', senderPhone);

    if (leadMarker) {
      console.log('[WA] Lead captured:', leadMarker);
      leadCapturedConvs.add(convId);
      if (conversationTimers.has(convId)) {
        clearTimeout(conversationTimers.get(convId));
        conversationTimers.delete(convId);
      }
      booking.handleLead(client.id, { ...leadMarker, source: 'whatsapp' }, senderPhone)
        .then(result => {
          const mobile = result?.lead?.mobile;
          if (mobile && String(senderPhone).includes('@lid')) {
            const digits = mobile.replace(/\D/g, '');
            const phone = digits.length === 10 ? '91' + digits : digits;
            if (phone.length >= 11) {
              lidPhoneMap.set(senderPhone, phone);
              console.log('[WA] lidPhoneMap updated from lead:', senderPhone, '→', phone);
            }
          }
        })
        .catch(e => console.error('[Booking] handleLead error:', e.message));
    }

    // --- Appointment Booking ---
    const slotMatch = aiReply.match(/\[BOOK_SLOT:([^|]+)\|([^|]+)\|([^|]+)\|([^\]]*)\]/);
    if (slotMatch) {
      const [, aptDate, aptTime, aptNaam, aptDesc] = slotMatch;
      const conflict = _db.get('appointments').filter({ clientId: client.id, date: aptDate.trim(), time: aptTime.trim(), status: 'confirmed' }).value();
      if (conflict.length > 0) {
        await sendMessage(client.id, senderPhone, `⚠️ Yeh slot (${aptDate.trim()} ${aptTime.trim()}) already booked hai. Doosra time choose karein.`);
      } else {
        _db.get('appointments').push({
          id: Date.now().toString(),
          clientId: client.id,
          date: aptDate.trim(),
          time: aptTime.trim(),
          customerPhone: senderPhone,
          customerName: aptNaam.trim(),
          description: aptDesc.trim(),
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        }).write();
        const ownerList = (client.ownerPhone || '').split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);
        if (ownerList.length > 0) {
          await sendMessage(client.id, ownerList[0], `📅 *New Appointment Booked*\n👤 ${aptNaam.trim()}\n📅 ${aptDate.trim()} at ${aptTime.trim()}\n📋 ${aptDesc.trim()}\n📞 ${senderPhone}`);
        }
        console.log('[Appointment] Booked:', aptNaam.trim(), aptDate.trim(), aptTime.trim());
      }
    }

    // --- Sentiment Alert ---
    const sentimentMatch = aiReply.match(/\[SENTIMENT:negative\|([^\]]+)\]/);
    if (sentimentMatch) {
      const reason = sentimentMatch[1].trim();
      const ownerList = (client.ownerPhone || '').split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);
      if (ownerList.length > 0) {
        await sendMessage(client.id, ownerList[0], `⚠️ *Frustrated Customer Alert*\n📞 ${senderPhone}\n💬 "${reason}"\n\nJald reply karein!`);
        console.log('[Sentiment] Alert sent for', senderPhone);
      }
    }

    // --- Agentic Action Detection ---
    const actionMatch = aiReply.match(/\[ACTION_REQUEST:([^|]+)\|([^|]+)\|([^\]]*)\]/);
    if (actionMatch) {
      const [, actionType, description, paramsStr] = actionMatch;
      const autoApprove = (client.autoApproveActions || []).includes(actionType.trim());
      const crypto = require('crypto');
      const actionId = crypto.randomUUID().slice(0, 8);
      const action = {
        id: actionId,
        clientId: client.id,
        type: actionType.trim(),
        description: description.trim(),
        params: paramsStr.trim(),
        customerPhone: senderPhone,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      if (autoApprove) {
        await executeAgentAction(client, action);
        console.log('[Agent] Auto-approved:', actionType);
      } else {
        _db.get('pendingActions').push(action).write();
        const ownerList = (client.ownerPhone || '').split(',').map(p => p.trim().replace(/\D/g,'')).filter(Boolean);
        if (ownerList.length > 0) {
          const permMsg = `🤖 *Action Request* [${actionId}]\n━━━━━━━━━━━━━━━\n📋 *${actionType.trim()}*\n${description.trim()}\n\n*HAAN* bolein to karo\n*NAHI* bolein to cancel`;
          await sendMessage(client.id, ownerList[0], permMsg);
          console.log('[Agent] Permission requested from owner:', actionType);
        }
      }
    }

    if (client.googleSheetWebhook) {
      axios.post(client.googleSheetWebhook, {
        clientName: client.name, userPhone: senderPhone, userMessage: userText,
        botReply: aiReply, timestamp: new Date().toLocaleString('en-IN'),
      }, { maxRedirects: 5, headers: { 'Content-Type': 'application/json' } })
        .then(() => console.log('[Sheet] Saved'))
        .catch(e => console.warn('[Sheet] Error:', e.message));
    }
  } catch (err) {
    console.error('[WA] handleMessage error:', err.message);
  }
}

// --- Execute agent action ---
async function executeAgentAction(client, action) {
  if (action.type === 'followup') {
    await sendMessage(client.id, action.customerPhone, action.description);
  } else if (action.type === 'offer') {
    await sendMessage(client.id, action.customerPhone, action.description);
  } else if (action.type === 'appointment') {
    await sendMessage(client.id, action.customerPhone, `✅ ${action.description}`);
  }
  if (_db) _db.get('pendingActions').find({ id: action.id }).assign({ status: 'done' }).write();
  console.log('[Agent] Action executed:', action.type, action.id);
}

// --- 5-min auto-lead sender ---
async function autoSendLeadFromTimer(client, senderPhone, convId) {
  if (leadCapturedConvs.has(convId)) return;
  leadCapturedConvs.add(convId);
  conversationTimers.delete(convId);

  console.log('[WA] 5-min timer fired for', senderPhone, '— auto-sending lead');

  const isLidJid = String(senderPhone).includes('@lid');
  const resolvedPhone = (isLidJid && lidPhoneMap.has(senderPhone))
    ? lidPhoneMap.get(senderPhone)
    : senderPhone;
  const phoneUnknown = isLidJid && !lidPhoneMap.has(senderPhone);

  await booking.handleLead(client.id, {
    naam: '',
    mobile: '',
    vehicle: '',
    area: '',
    source: 'meta_5min',
  }, resolvedPhone);

  const msg = phoneUnknown
    ? `Aapne service ke liye inquiry ki, shukriya! 🙏\n\nKripya apna *10-digit mobile number* reply karein — hamare mechanic aapse jald contact karenge.\n\n— ${client.name}`
    : `Aapka number note kar liya hai. Hamari team jald hi aapko call karegi service ke baare mein! 😊\n\n— ${client.name}`;

  await sendMessage(client.id, senderPhone, msg).catch(() => {});
}

// --- Fire outgoing webhook ---
async function fireWebhook(client, senderPhone, text, msgId) {
  if (!client.webhookUrl) return;
  const payload = {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: client.id },
    timestamp: Math.floor(Date.now() / 1000),
    idMessage: msgId || `${Date.now()}`,
    senderData: {
      chatId: senderPhone + '@c.us',
      sender: senderPhone + '@c.us',
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: text },
    },
  };
  try {
    await axios.post(client.webhookUrl, payload, { timeout: 8000 });
    console.log('[WA] Webhook fired to', client.webhookUrl);
  } catch (e) {
    console.warn('[WA] Webhook error:', e.message);
  }
}

// --- Stock Group Message Handler ---
async function handleGroupStockMessage(client, msg, text, location) {
  const groupJid = msg.key.remoteJid;
  const locationLabel = location === 'workshop' ? '🔧 Workshop' : '🏪 Showroom';
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  if (upper === 'STOCK' || upper === 'STOCK REPORT') {
    const stocks = _db.get('stock').filter({ clientId: client.id, location }).value();
    if (!stocks.length) {
      await sendToGroup(client.id, groupJid, `📦 ${locationLabel} stock khali hai.\n\nIN | Part Name | Qty | Staff Name se add karein.`);
      return;
    }
    const lines = stocks.map(s => `${s.qty > 0 ? '✅' : '🚨'} *${s.partName}* — ${s.qty} units`).join('\n');
    await sendToGroup(client.id, groupJid, `📦 *${locationLabel} Stock — ${client.name}*\n━━━━━━━━━━━━━━━\n${lines}`);
    return;
  }

  const inMatch = trimmed.match(/^IN\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(.+)$/i);
  if (inMatch) {
    const partName = inMatch[1].trim();
    const qty = parseInt(inMatch[2]);
    const staffName = inMatch[3].trim();
    const existing = _db.get('stock').find({ clientId: client.id, partName, location }).value();
    if (existing) {
      _db.get('stock').find({ clientId: client.id, partName, location }).assign({ qty: existing.qty + qty, updatedAt: new Date().toISOString() }).write();
    } else {
      _db.get('stock').push({ id: Date.now().toString(), clientId: client.id, partName, qty, location, updatedAt: new Date().toISOString() }).write();
    }
    const finalQty = _db.get('stock').find({ clientId: client.id, partName, location }).value()?.qty || qty;
    _db.get('stockTransactions').push({ id: Date.now().toString(), clientId: client.id, type: 'IN', partName, qty, staffName, location, timestamp: new Date().toISOString() }).write();
    await sendToGroup(client.id, groupJid, `✅ *Stock IN — ${locationLabel}*\n📦 ${partName}\n+${qty} units added\n👤 ${staffName}\n📊 Total: *${finalQty} units*`);
    fireStockSheet(client, { type: 'IN', partName, qty, staffName, location, currentQty: finalQty });
    console.log('[Stock] IN:', partName, qty, 'by', staffName, '|', location);
    return;
  }

  const outMatch = trimmed.match(/^OUT\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(.+)$/i);
  if (outMatch) {
    const partName = outMatch[1].trim();
    const qty = parseInt(outMatch[2]);
    const staffName = outMatch[3].trim();
    const existing = _db.get('stock').find({ clientId: client.id, partName, location }).value();
    if (!existing) {
      await sendToGroup(client.id, groupJid, `❌ *${partName}* ${locationLabel} stock mein nahi hai.\nPehle IN karein.`);
      return;
    }
    if (existing.qty < qty) {
      await sendToGroup(client.id, groupJid, `⚠️ *${partName}* sirf *${existing.qty} units* available hain.\n${qty} nahi de sakte.`);
      return;
    }
    const newQty = existing.qty - qty;
    _db.get('stock').find({ clientId: client.id, partName, location }).assign({ qty: newQty, updatedAt: new Date().toISOString() }).write();
    _db.get('stockTransactions').push({ id: Date.now().toString(), clientId: client.id, type: 'OUT', partName, qty, staffName, location, timestamp: new Date().toISOString() }).write();
    let reply = `✅ *Stock OUT — ${locationLabel}*\n📦 ${partName}\n-${qty} units\n👤 ${staffName}\n📊 Remaining: *${newQty} units*`;
    if (newQty === 0) reply += `\n\n🚨 *STOCK KHATAM! Turant order karein!*`;
    await sendToGroup(client.id, groupJid, reply);
    fireStockSheet(client, { type: 'OUT', partName, qty, staffName, location, currentQty: newQty });
    console.log('[Stock] OUT:', partName, qty, 'by', staffName, '|', location);
    return;
  }

  await sendToGroup(client.id, groupJid,
    `❌ Sahi format mein likhein:\n\n` +
    `➕ *IN | Part Name | Qty | Staff Name*\n` +
    `➖ *OUT | Part Name | Qty | Staff Name*\n` +
    `📦 *STOCK* — current stock dekhne ke liye`
  );
}

// --- Fire stock update to Google Sheet ---
function fireStockSheet(client, data) {
  if (!client.stockSheetWebhook) return;
  axios.post(client.stockSheetWebhook, {
    ...data,
    clientName: client.name,
    timestamp: new Date().toISOString(),
  }, { maxRedirects: 5, headers: { 'Content-Type': 'application/json' } })
    .then(() => console.log('[Sheet] Stock saved:', data.type, data.partName))
    .catch(e => console.warn('[Sheet] Stock error:', e.message));
}

// --- Incoming message handler — clientId bound at socket creation ---
async function handleIncoming(msg, clientId) {
  if (!_db) return;
  const jid = msg.key.remoteJid;
  if (!jid) return;
  if (jid === 'status@broadcast') return;

  // Group message
  if (jid.endsWith('@g.us')) {
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    if (!text.trim()) return;
    const client = _db.get('clients').find({ id: clientId }).value();
    if (!client) return;
    let location = null;
    if (client.workshopGroup && toGroupJID(client.workshopGroup) === jid) location = 'workshop';
    else if (client.showroomGroup && toGroupJID(client.showroomGroup) === jid) location = 'showroom';
    if (location) await handleGroupStockMessage(client, msg, text, location);
    return;
  }

  const hasImage = !!msg.message?.imageMessage;
  const hasAudio = !!(msg.message?.audioMessage);

  const text = msg.message?.conversation ||
               msg.message?.extendedTextMessage?.text ||
               msg.message?.imageMessage?.caption || '';

  if (!text.trim() && !hasImage && !hasAudio) return;

  let senderPhone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
  if (jid.endsWith('@s.whatsapp.net')) {
    console.log(`[WA:${clientId}] Phone from remoteJid:`, senderPhone);
  } else if (jid.endsWith('@lid')) {
    senderPhone = jid;
    console.log(`[WA:${clientId}] @lid contact:`, jid);
  }

  const client = _db.get('clients').find({ id: clientId }).value();
  if (!client) { console.warn(`[WA:${clientId}] Client not found`); return; }
  if (client.status !== 'active') return;

  const autoPatterns = [
    /did you mean one of these/i, /click pay now/i,
    /your (policy|account|order|invoice|otp|transaction)/i,
    /this is an automated/i, /do not reply to this/i, /unsubscribe/i,
  ];
  if (autoPatterns.some(p => p.test(text))) return;

  const convKey = `${clientId}_${senderPhone}`;
  const now = Date.now();
  if (now - (lastReply.get(convKey) || 0) < 5000) return;
  lastReply.set(convKey, now);

  console.log(`[WA:${clientId}] Incoming from`, senderPhone, ':', text.slice(0, 80));

  _pushNotif(clientId, {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: clientId, wid: senderPhone + '@c.us', typeInstance: 'whatsapp' },
    timestamp: Math.floor(Date.now() / 1000),
    idMessage: msg.key.id || `${Date.now()}`,
    senderData: { chatId: senderPhone + '@c.us', sender: senderPhone + '@c.us', senderName: '' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
  });

  fireWebhook(client, senderPhone, text, msg.key.id).catch(() => {});

  const ownerList = (client.ownerPhone || '').split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);
  const cleanPhone = senderPhone.replace(/\D/g, '');
  const isOwner = ownerList.some(op => cleanPhone.endsWith(op) || cleanPhone === op);

  if (isOwner) {
    console.log(`[WA:${clientId}] Owner message — trainer AI:`, text.slice(0, 40));
    await handleOwnerChat(client, senderPhone, text);
    return;
  }

  // --- Audio / Voice Note ---
  if (hasAudio) {
    console.log(`[WA:${clientId}] Audio message from`, senderPhone);
    try {
      const s = sessions.get(clientId);
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {});
      if (client.aiProvider === 'groq' && client.aiKey) {
        const transcribed = await whisper.transcribeAudio(buffer, client.aiKey);
        if (transcribed.trim()) {
          console.log(`[Whisper] Transcribed for ${senderPhone}:`, transcribed.slice(0, 60));
          await handleMessage(client, senderPhone, `[Voice]: ${transcribed}`);
        } else {
          await handleMessage(client, senderPhone, '[Voice message aaya lekin samajh nahi aaya. Please text mein likhein.]');
        }
      } else {
        await handleMessage(client, senderPhone, '[Voice message receive hua. Kripya apna sawaal text mein likhein.]');
      }
    } catch (e) {
      console.error(`[WA] Audio processing error:`, e.message);
      await handleMessage(client, senderPhone, '[Voice message receive hua. Kripya text mein likhein.]');
    }
    return;
  }

  // --- Image ---
  if (hasImage) {
    console.log(`[WA:${clientId}] Image from`, senderPhone);
    try {
      const s = sessions.get(clientId);
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {});
      const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
      const base64 = buffer.toString('base64');
      const caption = text.trim() || 'Is image mein kya problem hai? Diagnose karein aur batayein.';
      await handleMessage(client, senderPhone, caption, { mimeType, data: base64 });
    } catch (e) {
      console.error(`[WA] Image processing error:`, e.message);
      if (text.trim()) await handleMessage(client, senderPhone, text);
      else await handleMessage(client, senderPhone, '[Image receive hui. Kripya problem describe karein.]');
    }
    return;
  }

  // --- Regular Text ---
  await handleMessage(client, senderPhone, text);
}

// --- Boot a single client's Baileys session ---
async function bootClientSession(clientId, db) {
  if (!db && !_db) { console.error('[WA] bootClientSession: no db'); return; }
  const useDb = db || _db;
  if (db) setDB(db);

  const s = getSession(clientId);
  if (s.isBooting) return;
  s.isBooting = true;

  destroySock(clientId);
  await new Promise(r => setTimeout(r, 500));

  let state, saveCreds;
  try {
    ({ state, saveCreds } = await useFirebaseAuthState(clientId));
  } catch(e) {
    console.error(`[WA:${clientId}] Firebase auth state error:`, e.message);
    s.isBooting = false;
    setTimeout(() => bootClientSession(clientId, null), 8000);
    return;
  }

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
    console.log(`[WA:${clientId}] WhatsApp version:`, version.join('.'));
  } catch(e) {
    version = [2, 3000, 1035194821];
    console.warn(`[WA:${clientId}] Version fetch failed, using fallback`);
  }

  let currentSock;
  try {
    currentSock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      keepAliveIntervalMs: 25000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      getMessage: async () => ({ conversation: '' }),
    });
  } catch(e) {
    console.error(`[WA:${clientId}] makeWASocket error:`, e.message);
    s.isBooting = false;
    setTimeout(() => bootClientSession(clientId, null), 8000);
    return;
  }

  s.sock = currentSock;

  currentSock.ev.on('creds.update', saveCreds);

  currentSock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (s.sock !== currentSock) return; // stale event from old socket

    if (qr) {
      if (s.pairingPhone) {
        try {
          s.pairingCodeValue = await currentSock.requestPairingCode(s.pairingPhone);
          console.log(`[WA:${clientId}] Pairing code generated:`, s.pairingCodeValue);
        } catch(e) {
          console.error(`[WA:${clientId}] Pairing code error:`, e.message);
          s.qrData = qr;
        }
      } else {
        s.qrData = qr;
        console.log(`[WA:${clientId}] QR ready`);
        try { require('qrcode-terminal').generate(qr, { small: true }); } catch(_) {}
      }
    }

    if (connection === 'open') {
      s.connected = true;
      s.qrData = null;
      s.pairingPhone = null;
      s.pairingCodeValue = null;
      s.reconnectAttempts = 0;
      s.isBooting = false;
      console.log(`[WA:${clientId}] ✅ Connected!`);
      if (_db) _db.get('clients').find({ id: clientId }).assign({ waStatus: 'open' }).write();
    }

    if (connection === 'close') {
      s.connected = false;
      s.qrData = null;
      if (_db) _db.get('clients').find({ id: clientId }).assign({ waStatus: 'close' }).write();
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'unknown';
      console.log(`[WA:${clientId}] Disconnected — code:`, code, '| reason:', reason);

      const shouldClearSession =
        code === DisconnectReason.loggedOut ||
        code === DisconnectReason.badSession ||
        code === DisconnectReason.forbidden;

      if (shouldClearSession) {
        console.log(`[WA:${clientId}] Clearing session (code`, code, ') — new QR needed');
        axios.delete(`${FB_BASE}/wa-session-${clientId}.json`, { timeout: 10000 }).catch(() => {});
        s.reconnectAttempts = 0;
        s.isBooting = false;
        setTimeout(() => bootClientSession(clientId, null), 3000);
      } else if (code === DisconnectReason.restartRequired) {
        console.log(`[WA:${clientId}] Restart required (515) — reconnecting in 5s`);
        s.isBooting = false;
        setTimeout(() => bootClientSession(clientId, null), 5000);
      } else {
        s.reconnectAttempts++;
        const delay = Math.min(s.reconnectAttempts * 5000, 30000);
        console.log(`[WA:${clientId}] Reconnecting in`, delay / 1000, 's (attempt', s.reconnectAttempts, ')');
        s.isBooting = false;
        setTimeout(() => bootClientSession(clientId, null), delay);
      }
    }
  });

  currentSock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      try { await handleIncoming(msg, clientId); } catch (e) { console.error(`[WA:${clientId}] handleIncoming error:`, e.message); }
    }
  });

  console.log(`[WA:${clientId}] Baileys starting...`);
}

// --- Check if client has a saved Firebase session ---
async function hasSavedSession(clientId) {
  try {
    const res = await axios.get(`${FB_BASE}/wa-session-${clientId}/creds.json`, { timeout: 5000 });
    return !!res.data;
  } catch(e) { return false; }
}

// --- Boot all active Baileys clients on startup (only if saved session exists) ---
async function bootSessions(db) {
  setDB(db);
  const clients = db.get('clients').filter({ status: 'active' }).value();
  const baileyClients = clients.filter(c => !c.metaPhoneNumberId);
  console.log('[WA] bootSessions — checking', baileyClients.length, 'client(s) for saved sessions');
  for (const client of baileyClients) {
    const saved = await hasSavedSession(client.id);
    if (saved) {
      console.log('[WA] Saved session found for', client.name, '— booting');
      bootClientSession(client.id, db).catch(e => console.error('[WA] Boot error:', client.id, e.message));
    } else {
      console.log('[WA] No saved session for', client.name, '— waiting for manual connect');
    }
  }
}

// --- Meta Business API incoming message handler ---
async function handleIncomingMeta(client, senderPhone, text) {
  if (!_db) return;

  const convKey = `${client.id}_${senderPhone}`;
  const now = Date.now();
  if (now - (lastReply.get(convKey) || 0) < 5000) return;
  lastReply.set(convKey, now);

  console.log('[Meta] Incoming from', senderPhone, ':', text.slice(0, 80));

  const ownerList = (client.ownerPhone || '').split(',').map(p => p.trim().replace(/\D/g, ''));
  const cleanPhone = String(senderPhone).replace(/\D/g, '');
  const isOwner = ownerList.some(op => cleanPhone.endsWith(op) || cleanPhone === op);

  if (isOwner) {
    console.log('[Meta] Owner message — trainer AI:', text.slice(0, 40));
    await handleOwnerChat(client, senderPhone, text);
  } else {
    await handleMessage(client, senderPhone, text);
  }
}

async function processIncoming(webhookBody) {}

// --- Reboot: reconnect without clearing session ---
async function rebootClient(clientId) {
  console.log(`[WA:${clientId}] Reboot requested`);
  const s = getSession(clientId);
  destroySock(clientId);
  s.connected = false;
  s.qrData = null;
  s.isBooting = false;
  s.reconnectAttempts = 0;
  setTimeout(() => bootClientSession(clientId, null), 2000);
}

// --- Logout: clear session and get new QR ---
async function logoutClient(clientId) {
  console.log(`[WA:${clientId}] Logout requested — clearing session`);
  const s = getSession(clientId);
  destroySock(clientId);
  s.connected = false;
  s.qrData = null;
  s.isBooting = false;
  s.reconnectAttempts = 0;
  axios.delete(`${FB_BASE}/wa-session-${clientId}.json`, { timeout: 10000 }).catch(() => {});
  setTimeout(() => bootClientSession(clientId, null), 2000);
}

function getLidPhoneMap() { return lidPhoneMap; }

module.exports = {
  startClient, disconnectClient, rebootClient, logoutClient,
  getQRImage, getPairingCode, getStatus,
  setDB, getGroups, sendMessage, sendToGroup, bootSessions, bootClientSession, setPairingPhone,
  receiveNotification, deleteNotification, clearNotifications,
  processIncoming, handleIncomingMeta, getLidPhoneMap,
};
