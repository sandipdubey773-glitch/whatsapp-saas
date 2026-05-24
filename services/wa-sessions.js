const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const { callAI } = require('./ai');
const booking = require('./booking');
const { useFirebaseAuthState } = require('./firebase-auth-state');
const metaApi = require('./meta-api');

const lastReply = new Map();
const conversationTimers = new Map(); // convId → timeoutId
const leadCapturedConvs = new Set();  // convId of convs where lead was sent
const lidPhoneMap = new Map();        // '@lid JID' → 'phone digits' (populated from contacts.upsert)

let _db = null;
let sock = null;
let qrData = null;
let connected = false;
let pairingPhone = null;
let pairingCodeValue = null;
let reconnectAttempts = 0;
let isBooting = false;

// --- Green API Notification Queue ---
const notifQueues = new Map(); // clientId -> [{receiptId, ...}]
let receiptCounter = Date.now();

function _pushNotif(clientId, payload) {
  if (!notifQueues.has(clientId)) notifQueues.set(clientId, []);
  const q = notifQueues.get(clientId);
  if (q.length >= 100) q.shift(); // max 100
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
function getStatus() { return connected ? 'open' : 'close'; }
function getQRImage() { return qrData; }
function getPairingCode() { return pairingCodeValue; }
function disconnectClient() { if (sock) { try { sock.end(undefined); } catch(e){} sock = null; } }
function getGroups() { return []; }

function setPairingPhone(phone) {
  pairingPhone = String(phone).replace(/\D/g, '');
  pairingCodeValue = null;
}

async function startClient(id, phone) {
  setPairingPhone(phone);
  destroySock();
  connected = false;
  qrData = null;
  isBooting = false;
  reconnectAttempts = 0;
  await new Promise(r => setTimeout(r, 1000));
  bootSessions(_db);
}

function toJID(phone) {
  if (String(phone).includes('@')) return phone; // already a full JID (@lid, @s.whatsapp.net, etc.)
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
  if (!sock || !connected) throw new Error('WhatsApp connected nahi hai — pehle connect karo');
  try {
    await sock.sendMessage(toJID(to), { text });
    console.log('[WA] Sent to', to);
  } catch (err) {
    console.error('[WA] sendMessage error:', err.message);
    throw err;
  }
}

async function sendToGroup(clientId, groupId, text) {
  const client = _db?.get('clients').find({ id: clientId }).value();
  if (client?.metaPhoneNumberId) {
    console.warn('[Meta] Group messaging not supported via Meta API — skipping');
    return;
  }
  if (!sock || !connected) { console.error('[WA] Not connected — cannot send to group'); return; }
  try {
    await sock.sendMessage(toGroupJID(groupId), { text });
    console.log('[WA] Group sent to', groupId);
  } catch (err) {
    console.error('[WA] sendToGroup error:', err.message);
  }
}

// --- Owner trainer chat ---
async function handleOwnerChat(client, senderPhone, userText) {
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
- Agar naya rule: [ADD_RULE:rule]
- Agar "group mein daal": [SEND_META_LEADS_TO_GROUP]
- Agar "report do": [SEND_REPORT]
- Agar owner koi bhi message group mein bhejne ko kahe (jaise "group mein likho: Aaj band hai"): [SEND_GROUP:exact message here]
  Note: [SEND_GROUP:...] ke andar owner ka exact message likho, koi extra text mat add karo
- Agar owner kisi date ki leads maange (jaise "aaj ki leads", "kal ki leads", "15 may ki leads", "leads batao"): [GET_LEADS:YYYY-MM-DD]
  Note: Date ko YYYY-MM-DD format mein likho. "Aaj" = today, "Kal" = yesterday (wo jo guzar gaya), "Parso" = 2 din pehle
- Agar owner stock ke baare mein pooche (jaise "stock batao", "kitna stock hai", "kya khatam hai"): CURRENT STOCK section se seedha jawab de — koi marker nahi chahiye
- Agar owner stock ADD kare (jaise "workshop mein 10 engine oil add karo", "showroom mein 2 FZ-S aaye"): [STOCK_IN:location|Part Name|Qty|Owner]
  Note: location = "workshop" ya "showroom". Part Name exact likho.
- Agar owner stock NIKALE (jaise "workshop se 2 air filter gaya", "showroom se R15 1 bika"): [STOCK_OUT:location|Part Name|Qty|Owner]
  Note: location = "workshop" ya "showroom". Part Name exact likho.`;

  try {
    const ownerConvId = `${client.id}_owner_chat`;
    let ownerConv = db.get('conversations').find({ id: ownerConvId }).value();
    let messages = ownerConv?.messages || [];
    messages.push({ role: 'user', content: userText, timestamp: new Date().toISOString() });
    if (messages.length > 20) messages = messages.slice(-20);

    if (sock && connected) {
      sock.sendPresenceUpdate('composing', toJID(senderPhone)).catch(() => {});
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

    const campaignMatch2 = aiReply.match(/\[UPDATE_CAMPAIGN:([\s\S]*?)\]/);
    if (campaignMatch2) {
      const newCampaign = campaignMatch2[1].trim();
      let prompt = client.systemPrompt.replace(/\n\n═+\nCURRENT CAMPAIGN[\s\S]*?(?=\n\n═|$)/g, '').trim();
      prompt += `\n\n═══════════════════════════════════\nCURRENT CAMPAIGN (YAD RAKHO)\n═══════════════════════════════════\n${newCampaign}\n\nCustomer isi campaign se aa raha hai — yeh context hamesha use karo.`;
      db.get('clients').find({ id: client.id }).assign({ systemPrompt: prompt }).write();
      cleanReply = cleanReply.replace(/\[UPDATE_CAMPAIGN:[\s\S]*?\]/g, '').trim();
    }

    const ruleMatch = aiReply.match(/\[ADD_RULE:([\s\S]*?)\]/);
    if (ruleMatch) {
      const prompt = client.systemPrompt + `\n\n[OWNER RULE]: ${ruleMatch[1].trim()}`;
      db.get('clients').find({ id: client.id }).assign({ systemPrompt: prompt }).write();
      cleanReply = cleanReply.replace(/\[ADD_RULE:[\s\S]*?\]/g, '').trim();
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

    // STOCK_IN marker
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

    // STOCK_OUT marker
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

    await sendMessage(client.id, senderPhone, cleanReply || aiReply);
    console.log('[Owner] Trainer AI replied to', senderPhone);
  } catch (err) {
    console.error('[Owner] error:', err.message);
    await sendMessage(client.id, senderPhone, 'Error aaya: ' + err.message);
  }
}

// --- Customer chat ---
async function handleMessage(client, senderPhone, userText) {
  if (!_db) return;
  try {
    const convId = `${client.id}_${senderPhone}`;

    // Bot disabled for this conversation — skip AI, just store message
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

    // 5-minute auto-lead timer — reset on every message so it only fires after 5min of SILENCE
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
    const alreadyCaptured = messages.some(m => m.role === 'assistant' && m.content.includes('[LEAD_READY:'));
    const noLeadInstruction = alreadyCaptured ? '\n\n[SYSTEM: Lead pehle hi capture ho chuka hai — LEAD_READY marker DOBARA MAT LIKHO.]' : '';
    
    // Automatically pass the user's WhatsApp number so the bot doesn't ask for it
    const cleanCustomerPhone = senderPhone.replace(/\D/g, '');
    const phoneContext = `\n\n[SYSTEM: Is customer ka WhatsApp number ${cleanCustomerPhone} hai. Tumhe inse inka phone number NAHI poochna hai. Jab lead capture karo, toh 'mobile' field mein ${cleanCustomerPhone} hi likhna.]`;

    // Show typing indicator while AI is processing
    if (sock && connected) {
      sock.sendPresenceUpdate('composing', toJID(senderPhone)).catch(() => {});
    }

    const aiReply = await callAI({
      provider: client.aiProvider,
      apiKey: client.aiKey,
      systemPrompt: client.systemPrompt + dateContext + noLeadInstruction + phoneContext,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    messages.push({ role: 'assistant', content: aiReply, timestamp: new Date().toISOString() });
    const convData = { id: convId, clientId: client.id, clientName: client.name, userPhone: senderPhone, messages, lastUpdated: new Date().toISOString() };
    if (conv) _db.get('conversations').find({ id: convId }).assign(convData).write();
    else _db.get('conversations').push(convData).write();

    const leadMarker = booking.parseLead(aiReply);
    const cleanReply = aiReply.replace(/\[LEAD_READY:[^\]]+\]/g, '').trim();

    if (cleanReply) {
      if (client.typingDelayEnabled && sock && connected) {
        try {
          await sock.sendPresenceUpdate('composing', toJID(senderPhone));
          await new Promise(r => setTimeout(r, 2000));
          await sock.sendPresenceUpdate('paused', toJID(senderPhone));
        } catch (e) { /* ignore */ }
      }
      await sendMessage(client.id, senderPhone, cleanReply);
    }
    console.log('[WA] Replied to', senderPhone);

    if (leadMarker) {
      console.log('[WA] Lead captured:', leadMarker);
      // Clear 5-min timer — lead captured properly
      leadCapturedConvs.add(convId);
      if (conversationTimers.has(convId)) {
        clearTimeout(conversationTimers.get(convId));
        conversationTimers.delete(convId);
      }
      booking.handleLead(client.id, { ...leadMarker, source: 'whatsapp' }, senderPhone)
        .then(result => {
          // Back-populate lidPhoneMap when customer shares number in conversation
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

// --- 5-min auto-lead sender ---
async function autoSendLeadFromTimer(client, senderPhone, convId) {
  if (leadCapturedConvs.has(convId)) return;
  leadCapturedConvs.add(convId);
  conversationTimers.delete(convId);

  console.log('[WA] 5-min timer fired for', senderPhone, '— auto-sending lead');

  // If @lid, try to resolve phone from contacts map (may have populated in 5 mins)
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

// --- Fire outgoing webhook to client's server ---
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

  // STOCK — show current stock for this location
  if (upper === 'STOCK' || upper === 'STOCK REPORT') {
    const stocks = _db.get('stock').filter({ clientId: client.id, location }).value();
    if (!stocks.length) {
      await sendToGroup(client.id, groupJid, `📦 ${locationLabel} stock khali hai.\n\nIN | Part Name | Qty | Staff Name se add karein.`);
      return;
    }
    const lines = stocks.map(s => `${s.qty > 0 ? '✅' : '🚨'} *${s.partName}* — ${s.qty} units`).join('\n');
    await sendToGroup(client.id, groupJid, `📦 *${locationLabel} Stock — NJ YAMAHA*\n━━━━━━━━━━━━━━━\n${lines}`);
    return;
  }

  // IN | Part | Qty | Staff
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

  // OUT | Part | Qty | Staff
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

  // Wrong format
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

// --- Incoming message handler (Baileys event) ---
async function handleIncoming(msg) {
  if (!_db) return;
  const jid = msg.key.remoteJid;
  if (!jid) return;
  if (jid === 'status@broadcast') return;

  // Group message — only process if it's a known stock group
  if (jid.endsWith('@g.us')) {
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    if (!text.trim()) return;
    const clients = _db.get('clients').filter({ status: 'active' }).value();
    let matchClient = null, location = null;
    for (const c of clients) {
      if (c.workshopGroup && toGroupJID(c.workshopGroup) === jid) { matchClient = c; location = 'workshop'; break; }
      if (c.showroomGroup && toGroupJID(c.showroomGroup) === jid) { matchClient = c; location = 'showroom'; break; }
    }
    if (matchClient) await handleGroupStockMessage(matchClient, msg, text, location);
    return;
  }

  const text = msg.message?.conversation ||
               msg.message?.extendedTextMessage?.text ||
               msg.message?.imageMessage?.caption || '';
  if (!text.trim()) return;

  // Extract phone directly from remoteJid (919XXXXXXXXX@s.whatsapp.net format)
  // Contacts events use @lid (not phone) — don't rely on them for number resolution
  let senderPhone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
  if (jid.endsWith('@s.whatsapp.net')) {
    console.log('[WA] Phone from remoteJid:', senderPhone);
  } else if (jid.endsWith('@lid')) {
    // @lid contact — phone unknown until customer shares it in conversation
    senderPhone = jid; // use full @lid as unique key for conversation tracking
    console.log('[WA] @lid contact, phone unknown:', jid);
  }

  const clients = _db.get('clients').filter({ status: 'active' }).value();
  const client = clients[0];
  if (!client) { console.warn('[WA] No active client found'); return; }

  const autoPatterns = [
    /did you mean one of these/i, /click pay now/i,
    /your (policy|account|order|invoice|otp|transaction)/i,
    /this is an automated/i, /do not reply to this/i, /unsubscribe/i,
  ];
  if (autoPatterns.some(p => p.test(text))) return;

  const convKey = `${client.id}_${senderPhone}`;
  const now = Date.now();
  if (now - (lastReply.get(convKey) || 0) < 5000) return;
  lastReply.set(convKey, now);

  console.log('[WA] Incoming from', senderPhone, ':', text.slice(0, 80));

  // Push to Green API notification queue
  _pushNotif(client.id, {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: client.id, wid: senderPhone + '@c.us', typeInstance: 'whatsapp' },
    timestamp: Math.floor(Date.now() / 1000),
    idMessage: msg.key.id || `${Date.now()}`,
    senderData: { chatId: senderPhone + '@c.us', sender: senderPhone + '@c.us', senderName: '' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
  });

  // Fire outgoing webhook if client has one configured
  fireWebhook(client, senderPhone, text, msg.key.id).catch(() => {});

  const ownerList = (client.ownerPhone || '').split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);
  const cleanPhone = senderPhone.replace(/\D/g, '');
  const isOwner = ownerList.some(op => cleanPhone.endsWith(op) || cleanPhone === op);

  if (isOwner) {
    console.log('[WA] Owner message — trainer AI:', text.slice(0, 40));
    await handleOwnerChat(client, senderPhone, text);
  } else {
    await handleMessage(client, senderPhone, text);
  }
}

// --- Cleanup old socket safely ---
function destroySock() {
  if (!sock) return;
  const old = sock;
  sock = null;
  try { old.ev.removeAllListeners(); } catch(_) {}
  try { old.ws?.removeAllListeners(); } catch(_) {}
  try { old.end(undefined); } catch(_) {}
  try { old.ws?.close(); } catch(_) {}
}

// --- Boot Baileys ---
async function bootSessions(db) {
  if (isBooting) return;
  isBooting = true;
  setDB(db);

  // Kill old socket first — prevent event listener conflicts
  destroySock();
  await new Promise(r => setTimeout(r, 500));

  let state, saveCreds;
  try {
    ({ state, saveCreds } = await useFirebaseAuthState());
  } catch(e) {
    console.error('[WA] Firebase auth state error:', e.message);
    isBooting = false;
    setTimeout(() => bootSessions(db), 8000);
    return;
  }

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
    console.log('[WA] WhatsApp version:', version.join('.'));
  } catch(e) {
    version = [2, 3000, 1035194821];
    console.warn('[WA] Version fetch failed, using fallback');
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
    console.error('[WA] makeWASocket error:', e.message);
    isBooting = false;
    setTimeout(() => bootSessions(db), 8000);
    return;
  }

  sock = currentSock;

  sock.ev.on('creds.update', saveCreds);

  // contacts events use @lid IDs (not phone numbers) — no reliable phone resolution possible
  // Phone numbers come directly from msg.key.remoteJid (@s.whatsapp.net format)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // Stale event from old socket — ignore
    if (sock !== currentSock) return;

    if (qr) {
      if (pairingPhone) {
        try {
          pairingCodeValue = await currentSock.requestPairingCode(pairingPhone);
          console.log('[WA] Pairing code generated:', pairingCodeValue);
        } catch(e) {
          console.error('[WA] Pairing code error:', e.message);
          qrData = qr;
        }
      } else {
        qrData = qr;
        console.log('[WA] QR ready — visit /qr to scan');
        require('qrcode-terminal').generate(qr, { small: true });
      }
    }

    if (connection === 'open') {
      connected = true;
      qrData = null;
      pairingPhone = null;
      pairingCodeValue = null;
      reconnectAttempts = 0;
      isBooting = false;
      console.log('[WA] ✅ Connected!');
      if (_db) _db.get('clients').filter({ status: 'active' }).each(c => { c.waStatus = 'open'; }).write();
    }

    if (connection === 'close') {
      connected = false;
      qrData = null;
      if (_db) _db.get('clients').filter({ status: 'active' }).each(c => { c.waStatus = 'close'; }).write();
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'unknown';
      console.log('[WA] Disconnected — code:', code, '| reason:', reason);

      // Keep isBooting=true during delay so nothing else sneaks in
      const shouldClearSession =
        code === DisconnectReason.loggedOut ||
        code === DisconnectReason.badSession ||
        code === DisconnectReason.forbidden;

      if (shouldClearSession) {
        console.log('[WA] Clearing session (code', code, ') — new QR needed');
        axios.delete('https://shivangi-auto-clinic-99030-default-rtdb.firebaseio.com/wa-session.json', { timeout: 10000 }).catch(() => {});
        reconnectAttempts = 0;
        isBooting = false;
        setTimeout(() => bootSessions(db), 3000);
      } else if (code === DisconnectReason.restartRequired) {
        // 515: WhatsApp says restart — wait 5s for WA servers to be ready
        console.log('[WA] Restart required (515) — reconnecting in 5s with saved session');
        isBooting = false;
        setTimeout(() => bootSessions(db), 5000);
      } else {
        reconnectAttempts++;
        const delay = Math.min(reconnectAttempts * 5000, 30000);
        console.log('[WA] Reconnecting in', delay / 1000, 's (attempt', reconnectAttempts, ')');
        isBooting = false;
        setTimeout(() => bootSessions(db), delay);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      try { await handleIncoming(msg); } catch (e) { console.error('[WA] handleIncoming error:', e.message); }
    }
  });

  console.log('[WA] Baileys starting...');
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

// Legacy stub — no longer used (kept for route compatibility)
async function processIncoming(webhookBody) {}

// --- Reboot: reconnect without clearing session ---
async function rebootClient() {
  console.log('[WA] Reboot requested');
  destroySock();
  connected = false;
  qrData = null;
  isBooting = false;
  reconnectAttempts = 0;
  setTimeout(() => bootSessions(_db), 2000);
}

// --- Logout: clear session and get new QR ---
async function logoutClient() {
  console.log('[WA] Logout requested — clearing session');
  destroySock();
  connected = false;
  qrData = null;
  isBooting = false;
  reconnectAttempts = 0;
  // Clear Firebase session so fresh QR is generated
  const axios = require('axios');
  axios.delete('https://shivangi-auto-clinic-99030-default-rtdb.firebaseio.com/wa-session.json', { timeout: 10000 }).catch(() => {});
  setTimeout(() => bootSessions(_db), 2000);
}

function getLidPhoneMap() { return lidPhoneMap; }

module.exports = {
  startClient, disconnectClient, rebootClient, logoutClient,
  getQRImage, getPairingCode, getStatus,
  setDB, getGroups, sendMessage, sendToGroup, bootSessions, setPairingPhone,
  receiveNotification, deleteNotification, clearNotifications,
  processIncoming, handleIncomingMeta, getLidPhoneMap,
};
