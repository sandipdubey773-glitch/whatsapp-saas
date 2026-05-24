const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
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

  const text = msg.message?.conversation ||
               msg.message?.extendedTextMessage?.text ||
               msg.message?.imageMessage?.caption || '';
  if (!text.trim()) return;

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
  } else {
    await handleMessage(client, senderPhone, text);
  }
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
