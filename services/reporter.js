const cron = require('node-cron');

let _db = null;
let _waSessions = null;

function init(db, waSessions) {
  _db = db;
  _waSessions = waSessions;
  console.log('[Reporter] Initialized');

  cron.schedule('0 21 * * *', () => {
    console.log('[Reporter] Sending daily reports...');
    sendAllReports();
  }, { timezone: 'Asia/Kolkata' });
}

// Conversation se customer info extract karo
function extractCustomerInfo(messages) {
  // Sirf user messages se extract karo (customer ne jo kaha)
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
  const allText = messages.map(m => m.content).join(' ');

  // Phone number — customer ke messages mein (10 digit India numbers)
  const phoneMatches = userText.match(/\b[6-9]\d{9}\b/g) || [];
  const phone = phoneMatches.length > 0 ? phoneMatches[phoneMatches.length - 1] : null;

  // Vehicle model
  const vehicles = [
    'Splendor Plus','Splendor','Activa 6G','Activa 5G','Activa','Shine','Pulsar NS','Pulsar','Apache',
    'FZ S','FZ','R15','Bullet 350','Bullet','Classic 350','Meteor','Hunter 350',
    'Dio','Jupiter 125','Jupiter','Fascino','Access 125','Access','Burgman',
    'Gixxer SF','Gixxer','Duke 200','Duke 125','Duke','Dominar 400','Dominar',
    'HF Deluxe','CD 110','Platina','Discover','CT100','Avenger'
  ];
  let vehicle = null;
  for (const v of vehicles) {
    if (allText.toLowerCase().includes(v.toLowerCase())) { vehicle = v; break; }
  }

  // Year (2015-2026)
  const yearMatch = userText.match(/\b(201[5-9]|202[0-6])\b/);
  const year = yearMatch ? yearMatch[0] : null;

  // Customer name — user ke message se
  const namePatterns = [
    /(?:naam|name)\s+(?:hai\s+)?([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i,
    /(?:main|mai|mera naam)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i,
    /([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s+(?:bol raha|hoon|hun|here)/i,
  ];
  let name = null;
  for (const p of namePatterns) {
    const m = userText.match(p);
    if (m?.[1]) { name = m[1]; break; }
  }

  // Area/location
  const areaPatterns = [/(?:area|location|jagah|rehta|rahta|se hoon|mein rehta)\s*[:\-]?\s*([A-Za-z ]{3,20})/i];
  let area = null;
  for (const p of areaPatterns) {
    const m = userText.match(p);
    if (m?.[1]) { area = m[1].trim(); break; }
  }

  return {
    phone,
    vehicle: vehicle ? (vehicle + (year ? ' ' + year : '')) : null,
    name,
    area
  };
}

function generateReport(clientId, type = 'manual') {
  if (!_db) return null;

  const client = _db.get('clients').find({ id: clientId }).value();
  if (!client) return null;

  const allConvs = _db.get('conversations').filter({ clientId }).value();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Manual = aaj tak, daily = aaj ki
  const convs = type === 'daily'
    ? allConvs.filter(c => c.lastUpdated?.startsWith(today))
    : allConvs;

  const totalMsgs = convs.reduce((sum, c) => sum + (c.messages?.length || 0), 0);

  const customerLines = convs.map((c, i) => {
    const msgs = c.messages || [];
    const info = extractCustomerInfo(msgs);

    // Real phone priority: 1) stored WA number  2) conversation se  3) not found
    const storedPhone = c.userPhone && /^\d{10,15}$/.test(c.userPhone) ? c.userPhone : null;
    const num = storedPhone || info.phone || '❓ Number nahi diya';
    const name = c.contactName || info.name || '❓ Naam nahi diya';
    const vehicle = info.vehicle || '❓ Vehicle nahi bataya';
    const area = info.area || '—';
    const userMsgs = msgs.filter(m => m.role === 'user');
    const msgCount = userMsgs.length;
    const lastMsg = userMsgs.slice(-1)[0]?.content || '';

    return `${i + 1}. 👤 *${name}*\n` +
           `   📱 *${num}*\n` +
           `   🏍️ ${vehicle}\n` +
           `   📍 ${area}\n` +
           `   💬 ${msgCount} msgs — "${lastMsg.slice(0, 60)}${lastMsg.length > 60 ? '...' : ''}"`;
  }).join('\n\n');

  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const label = type === 'daily' ? 'Daily Report (Aaj ki)' : 'Report (Ab tak ki)';

  return `📊 *${label} — ${client.name}*
📅 ${dateStr}
${'─'.repeat(32)}

👥 Customers: *${convs.length}*
💬 Total Messages: *${totalMsgs}*

${convs.length > 0 ? `*Customer Details:*\n\n${customerLines}` : '📭 Koi conversation nahi mili'}

${'─'.repeat(32)}
🤖 WhatsApp SaaS Bot`;
}

async function sendReportToClient(clientId, type = 'manual') {
  if (!_db || !_waSessions) return { success: false, error: 'Not initialized' };

  const client = _db.get('clients').find({ id: clientId }).value();
  if (!client) return { success: false, error: 'Client not found' };
  if (!client.reportPhone) return { success: false, error: 'reportPhone set nahi hai' };

  const status = _waSessions.getStatus(clientId);
  if (status !== 'open') return { success: false, error: 'WhatsApp connected nahi hai' };

  const report = generateReport(clientId, type);
  if (!report) return { success: false, error: 'Report generate nahi hui' };

  try {
    await _waSessions.sendMessage(clientId, client.reportPhone, report);
    console.log('[Reporter] Report sent to', client.reportPhone);
    return { success: true };
  } catch (err) {
    console.error('[Reporter] Send error:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendAllReports() {
  if (!_db) return;
  const clients = _db.get('clients').filter({ status: 'active' }).value();
  for (const c of clients) {
    if (c.reportPhone) {
      const result = await sendReportToClient(c.id, 'daily');
      console.log('[Reporter]', c.name, ':', result.success ? '✅ Sent' : '❌ ' + result.error);
    }
    if (c.leadGroup) {
      const report = generateReport(c.id, 'daily');
      if (report) {
        try {
          await _waSessions.sendToGroup(c.id, c.leadGroup, report);
          console.log('[Reporter] Group report sent to', c.leadGroup);
        } catch (err) {
          console.error('[Reporter] Group report error:', err.message);
        }
      }
    }
  }
}

module.exports = { init, sendReportToClient, generateReport };
