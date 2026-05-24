const cron = require('node-cron');
const axios = require('axios');

let _db = null;
let _waSessions = null;

const APP_URL = process.env.APP_URL || 'https://shivangi-saas-bot.onrender.com';

// ─── Firebase Persistence ────────────────────────────────────────────────────
const FB_URL = 'https://shivangi-auto-clinic-99030-default-rtdb.firebaseio.com/bookings-data.json';
let _cache = null; // in-memory cache — loaded from Firebase on startup

async function loadFromFirebase() {
  try {
    const res = await axios.get(FB_URL, { timeout: 15000 });
    _cache = res.data || { bookings: [], leads: [] };
    console.log('[Booking] Firebase se data load hua —', (_cache.leads || []).length, 'leads');
  } catch (e) {
    console.warn('[Booking] Firebase load failed:', e.message, '— fresh start');
    _cache = { bookings: [], leads: [] };
  }
}

function saveToFirebase(data) {
  axios.put(FB_URL, data, { timeout: 15000 })
    .then(() => console.log('[Booking] Firebase save OK'))
    .catch(e => console.warn('[Booking] Firebase save failed:', e.message));
}

function loadData() {
  return _cache || { bookings: [], leads: [] };
}

function saveData(data) {
  _cache = data;
  saveToFirebase(data);
}
// ─────────────────────────────────────────────────────────────────────────────

async function init(db, waSessions) {
  _db = db;
  _waSessions = waSessions;

  await loadFromFirebase();

  cron.schedule('0 19 * * *', () => {
    console.log('[Booking] Sending evening report...');
    sendEveningReport();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 8 * * *', () => {
    console.log('[Booking] Sending today reminders...');
    sendTodayReminders();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 10 * * *', () => {
    console.log('[Booking] Checking pending followups...');
    sendFollowupReminder();
  }, { timezone: 'Asia/Kolkata' });

  console.log('[Booking] Initialized — 3 cron jobs active');
}

function resolveCallNumber(lead) {
  if (lead.mobile) {
    const digits = lead.mobile.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) {
      const num = digits.replace(/^91/, '');
      return num.length === 10 ? `+91${num}` : `+${digits}`;
    }
    if (digits.length > 13) return digits; // @lid-derived numeric ID
  }
  if (lead.customerJid) {
    const part = String(lead.customerJid).split('@')[0].replace(/\D/g, '');
    if (part.length >= 10 && part.length <= 13) {
      const num = part.replace(/^91/, '');
      return num.length === 10 ? `+91${num}` : `+${part}`;
    }
    if (part.length > 13) return part; // @lid numeric ID — not callable but best available
  }
  return '❓ Number nahi mila';
}

function isSunday(dateStr) {
  return new Date(dateStr).getDay() === 0;
}

function getSlotCount(dateStr, bookings) {
  return bookings.filter(b => b.date === dateStr).length;
}

function getNextAvailableDate(preferredDate) {
  let d = new Date(preferredDate || new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) d = new Date(today);

  const data = loadData();
  for (let i = 0; i < 30; i++) {
    const dateStr = d.toISOString().split('T')[0];
    if (!isSunday(dateStr) && getSlotCount(dateStr, data.bookings) < 10) {
      return dateStr;
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function getLeadNumForDate(clientId, date, existingLeads) {
  return existingLeads.filter(l => l.clientId === clientId && l.createdDate === date).length + 1;
}

function extractPhoneFromJid(jid) {
  if (!jid) return '';
  // Use split('@')[0] — works for both @s.whatsapp.net and @lid
  const phone = String(jid).split('@')[0].replace(/\D/g, '');
  if (phone.length < 10) return '';
  // Real phone (10-13 digits): format as +91XXXXXXXXXX
  if (phone.length <= 13) {
    const num = phone.replace(/^91/, '');
    return num.length === 10 ? `+91${num}` : `+${phone}`;
  }
  // @lid prefix (14+ digits): store raw — not callable but better than nothing
  return phone;
}

async function handleLead(clientId, leadData, customerJid) {
  const data = loadData();
  const createdDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const jidMobile = extractPhoneFromJid(customerJid);

  // Same customer ka aaj already lead hai? → update karo, duplicate mat banao
  if (customerJid) {
    const existingIdx = data.leads.findIndex(
      l => l.clientId === clientId && l.customerJid === customerJid && l.createdDate === createdDate
    );
    if (existingIdx >= 0) {
      const existing = data.leads[existingIdx];
      let changed = false;
      if (leadData.naam && !existing.naam) { existing.naam = leadData.naam; changed = true; }
      if (!existing.mobile) { const m = leadData.mobile || jidMobile; if (m) { existing.mobile = m; changed = true; } }
      if (leadData.vehicle && !existing.vehicle) { existing.vehicle = leadData.vehicle; changed = true; }
      if (leadData.area && !existing.area) { existing.area = leadData.area; changed = true; }
      if (changed) {
        saveData(data);
        console.log('[Booking] Lead updated (same customer):', `Lead ${existing.leadNum}`, existing.naam || customerJid);
      }
      return { lead: existing, assignedDate: existing.assignedDate };
    }
  }

  const preferred = leadData.date;
  const preferredAvailable = preferred && !isSunday(preferred) && getSlotCount(preferred, data.bookings) < 10;
  const assignedDate = preferredAvailable ? preferred : getNextAvailableDate(preferred);
  const dateChanged = preferred && !preferredAvailable;

  const leadNum = getLeadNumForDate(clientId, createdDate, data.leads);
  const leadId = Date.now().toString();

  const lead = {
    id: leadId,
    clientId,
    leadNum,
    createdDate,
    naam: leadData.naam || '',
    mobile: leadData.mobile || jidMobile,
    vehicle: leadData.vehicle || '',
    area: leadData.area || '',
    source: leadData.source || 'meta_ads',
    preferredDate: preferred || '',
    assignedDate: assignedDate || '',
    customerJid: customerJid || '',
    called: false,
    calledAt: null,
    feedback: '',
    feedbackGiven: false,
    feedbackAt: null,
    serviceDone: false,
    createdAt: new Date().toISOString(),
  };

  data.leads.push(lead);
  if (assignedDate) {
    data.bookings.push({
      id: leadId,
      date: assignedDate,
      naam: lead.naam,
      mobile: lead.mobile,
      vehicle: lead.vehicle,
      area: lead.area,
    });
  }
  saveData(data);

  console.log('[Booking] Lead saved:', `Lead ${leadNum}`, lead.naam || resolveCallNumber(lead), '→', createdDate);

  await sendToTeamGroup(clientId, lead, dateChanged, assignedDate);
  await sendToOwnerPersonal(clientId, lead);
  await saveToSheet(clientId, lead);

  return { lead, assignedDate };
}

async function sendToTeamGroup(clientId, lead, dateChanged, assignedDate) {
  const client = _db?.get('clients').find({ id: clientId }).value();
  if (!client?.leadGroup) return;

  let status = _waSessions.getStatus();
  for (let i = 0; i < 5 && status !== 'open'; i++) {
    await new Promise(r => setTimeout(r, 10000));
    status = _waSessions.getStatus();
  }
  if (status !== 'open') return;

  const slotData = loadData();
  const slotCount = getSlotCount(assignedDate, slotData.bookings);
  const callNum = resolveCallNumber(lead);

  const dateNote = assignedDate
    ? (dateChanged
      ? `📅 *${assignedDate}* _(${lead.preferredDate} full tha, next date diya)_`
      : `📅 *${assignedDate}*`)
    : `📅 Date TBD`;

  const sourceTag = lead.source === 'meta_5min' ? '⏰ 5-min Auto Lead' : '🤖 Bot Lead';

  const msg = `🔔 *NEW LEAD — ${client.name}*
━━━━━━━━━━━━━━━━━━━━━
📋 *Lead ${lead.leadNum}* — ${lead.createdDate} | ${sourceTag}
👤 *Naam:* ${lead.naam || '❓ N/A'}
📞 *Phone:* ${callNum}
🏍️ *Vehicle:* ${lead.vehicle || '❓ N/A'}
📍 *Area:* ${lead.area || '❓ N/A'}
${dateNote}
━━━━━━━━━━━━━━━━━━━━━
✏️ *Feedback:* ${APP_URL}/f/${lead.id}`;

  try {
    await _waSessions.sendToGroup(clientId, client.leadGroup, msg);
    console.log('[Booking] Team group notified — Lead', lead.leadNum);
  } catch (err) {
    console.error('[Booking] Group send error:', err.message);
  }
}

async function sendToOwnerPersonal(clientId, lead) {
  const client = _db?.get('clients').find({ id: clientId }).value();
  if (!client?.reportPhone) return;

  const status = _waSessions.getStatus();
  if (status !== 'open') return;

  const callNum = resolveCallNumber(lead);

  const msg = `🔔 *Naya Lead — Lead ${lead.leadNum}!*
━━━━━━━━━━━━━━━━━━━━━
👤 *Naam:* ${lead.naam || '❓ N/A'}
📞 *Phone:* ${callNum}
🏍️ *Vehicle:* ${lead.vehicle || '❓ N/A'}
📍 *Area:* ${lead.area || '❓ N/A'}
📅 *Date:* ${lead.createdDate}
━━━━━━━━━━━━━━━━━━━━━
✏️ *Feedback:* ${APP_URL}/f/${lead.id}`;

  try {
    await _waSessions.sendMessage(clientId, client.reportPhone, msg);
    console.log('[Booking] Owner notified — Lead', lead.leadNum);
  } catch (err) {
    console.error('[Booking] Owner notify error:', err.message);
  }
}

async function saveToSheet(clientId, lead) {
  const client = _db?.get('clients').find({ id: clientId }).value();
  if (!client?.googleSheetWebhook) return;
  try {
    await axios.post(client.googleSheetWebhook, {
      action: 'addLead',
      id: lead.id,
      leadNum: lead.leadNum,
      createdDate: lead.createdDate,
      naam: lead.naam,
      mobile: resolveCallNumber(lead),
      vehicle: lead.vehicle,
      area: lead.area,
      source: lead.source,
      preferredDate: lead.preferredDate,
      assignedDate: lead.assignedDate,
      timestamp: new Date().toLocaleString('en-IN'),
    }, { maxRedirects: 5, headers: { 'Content-Type': 'application/json' } });
    console.log('[Booking] Lead saved to Google Sheet');
  } catch (err) {
    console.warn('[Booking] Sheet save error:', err.message);
  }
}

async function sendEveningReport() {
  if (!_db || !_waSessions) return;
  const clients = _db.get('clients').filter({ status: 'active' }).value();

  for (const client of clients) {
    if (!client.leadGroup) continue;
    const status = _waSessions.getStatus(client.id);
    if (status !== 'open') continue;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const data = loadData();
    const todayLeads = data.leads.filter(l => l.clientId === client.id && l.createdDate === today);
    const calledCount = todayLeads.filter(l => l.called).length;
    const feedbackCount = todayLeads.filter(l => l.feedbackGiven).length;
    const doneCount = todayLeads.filter(l => l.serviceDone).length;

    const leadLines = todayLeads.map(l => {
      const icon = l.feedbackGiven ? '✅' : l.called ? '📞' : '❌';
      const callNum = resolveCallNumber(l);
      const naamPart = l.naam ? `${l.naam} — ` : '';
      return `${icon} Lead ${l.leadNum}: ${naamPart}${callNum}\n   ${l.feedbackGiven ? '💬 ' + l.feedback : l.called ? 'Called, feedback baaki' : 'Call baaki hai'}`;
    }).join('\n\n') || '  Koi lead nahi aaj';

    const report = `📊 *SHAM KI REPORT — ${client.name}*
📅 Aaj: ${today}
━━━━━━━━━━━━━━━━━━━━━
📋 Total Leads: *${todayLeads.length}*
📞 Called: *${calledCount}/${todayLeads.length}*
💬 Feedback diya: *${feedbackCount}/${todayLeads.length}*
✅ Service done: *${doneCount}/${todayLeads.length}*
━━━━━━━━━━━━━━━━━━━━━
${leadLines}
━━━━━━━━━━━━━━━━━━━━━
🤖 Auto Report — ${client.name}`;

    try {
      await _waSessions.sendToGroup(client.id, client.leadGroup, report);
      console.log('[Booking] Evening report sent');
    } catch (err) {
      console.error('[Booking] Evening report error:', err.message);
    }
  }
}

async function sendTodayReminders() {
  if (!_db || !_waSessions) return;
  const clients = _db.get('clients').filter({ status: 'active' }).value();

  for (const client of clients) {
    const status = _waSessions.getStatus(client.id);
    if (status !== 'open') continue;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const data = loadData();
    const todayLeads = data.leads.filter(l => l.clientId === client.id && l.assignedDate === today);

    for (const lead of todayLeads) {
      if (!lead.mobile || lead.mobile.replace(/\D/g, '').length < 10) continue;
      if (lead.noReminder) continue;

      const msg = `🛵 *${client.name} — Service Reminder*

Namaste${lead.naam ? ` *${lead.naam}*` : ''} ji! 🙏

Aaj aapki vehicle ki service scheduled hai.

🏍️ *Vehicle:* ${lead.vehicle}
📅 *Date:* ${today}
📍 *Location:* ${lead.area}

Hamare mechanic aaj aapke doorstep pe aayenge. Please ghar pe rahein.

— *${client.name} Team*`;

      try {
        await _waSessions.sendMessage(client.id, lead.mobile, msg);
        console.log('[Booking] Morning reminder sent to', lead.mobile);
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error('[Booking] Reminder error:', err.message);
      }
    }
  }
}

async function sendFollowupReminder() {
  if (!_db || !_waSessions) return;
  const clients = _db.get('clients').filter({ status: 'active' }).value();

  for (const client of clients) {
    if (!client.leadGroup) continue;
    const status = _waSessions.getStatus(client.id);
    if (status !== 'open') continue;

    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const data = loadData();
    const pendingLeads = data.leads.filter(l =>
      l.clientId === client.id &&
      l.createdDate === yesterday &&
      !l.called
    );

    if (pendingLeads.length === 0) continue;

    const lines = pendingLeads.map(l => `  • Lead ${l.leadNum}: ${l.naam || '?'} — ${resolveCallNumber(l)}`).join('\n');
    const msg = `⚠️ *Follow-up Alert — ${client.name}*

Kal ke yeh leads hain jinhe call nahi kiya gaya:

${lines}

Inhe aaj call karo aur feedback bharo.`;

    try {
      await _waSessions.sendToGroup(client.id, client.leadGroup, msg);
    } catch (err) {
      console.error('[Booking] Followup reminder error:', err.message);
    }
  }
}

function updateLeadStatus(leadId, updates) {
  const data = loadData();
  const lead = data.leads.find(l => l.id === leadId);
  if (!lead) return false;
  Object.assign(lead, updates);
  saveData(data);
  return true;
}

function markCalled(leadId) {
  return updateLeadStatus(leadId, { called: true, calledAt: new Date().toISOString() });
}

function addFeedback(leadId, feedback) {
  const data = loadData();
  const lead = data.leads.find(l => l.id === leadId);
  if (!lead) return false;
  lead.feedback = feedback;
  lead.feedbackGiven = true;
  lead.feedbackAt = new Date().toISOString();
  lead.called = true;
  if (!lead.calledAt) lead.calledAt = new Date().toISOString();
  saveData(data);
  return true;
}

function getLeadsByDate(clientId, date) {
  const data = loadData();
  return data.leads
    .filter(l => l.clientId === clientId && l.createdDate === date)
    .sort((a, b) => a.leadNum - b.leadNum)
    .map(l => ({ ...l, callNumber: resolveCallNumber(l) }));
}

function getTodayBookings(clientId) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const data = loadData();
  return data.leads.filter(l => l.clientId === clientId && l.createdDate === today);
}

function getAllLeads(clientId, limit = 50) {
  const data = loadData();
  return data.leads
    .filter(l => l.clientId === clientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

function parseLead(text) {
  const match = text.match(/\[LEAD_READY:([^\]]+)\]/);
  if (!match) return null;
  const lead = {};
  const sep = match[1].includes('|') ? '|' : ',';
  match[1].split(sep).forEach(part => {
    const eqIdx = part.indexOf('=');
    if (eqIdx > -1) {
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      lead[key] = val;
    }
  });
  return Object.keys(lead).length > 0 ? lead : null;
}

module.exports = {
  init,
  handleLead,
  updateLeadStatus,
  markCalled,
  addFeedback,
  getLeadsByDate,
  getTodayBookings,
  getAllLeads,
  parseLead,
  sendEveningReport,
  sendTodayReminders,
  sendFollowupReminder,
  getNextAvailableDate,
  resolveCallNumber,
  loadData,
};
