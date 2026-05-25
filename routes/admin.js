const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const { startClient, disconnectClient, getQRImage, getPairingCode, getStatus, setDB, getGroups, sendMessage, setPairingPhone, bootClientSession } = require('../services/wa-sessions');
const { sendReportToClient, generateReport } = require('../services/reporter');
const greenApi = require('../services/green-api');

setDB(db);

// QR scan page — auth nahi chahiye (browser mein khulega)
router.get('/scan/:id', async (req, res) => {
  const { id } = req.params;
  const status = getStatus(id);

  const S = `font-family:sans-serif;text-align:center;padding:30px;background:#f0f2f5`;
  const formHtml = `
    <hr style="margin:30px 0;border:none;border-top:1px solid #ddd"/>
    <h3 style="color:#333">📲 Pairing Code se Connect Karo (Easy)</h3>
    <p style="color:#555;font-size:14px">Apna WhatsApp number daalo — ek 8-char code milega</p>
    <form method="GET" action="/admin/scan/${id}">
      <input name="phone" placeholder="91XXXXXXXXXX" required
        style="padding:12px 16px;font-size:16px;border:2px solid #25d366;border-radius:8px;width:220px;outline:none"/>
      <button type="submit"
        style="padding:12px 20px;background:#25d366;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-left:8px">
        Code Bhejo
      </button>
    </form>
    <p style="color:#aaa;font-size:12px;margin-top:10px">Country code ke saath: 91XXXXXXXXXX</p>`;

  if (status === 'open') {
    return res.send(`<html><body style="${S}"><h2 style="color:#25d366">✅ WhatsApp Connected!</h2><p>Bot chal raha hai 24/7</p></body></html>`);
  }

  // Pairing code request
  const phone = req.query.phone;
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    startClient(id, cleanPhone).catch(e => console.error('[WA] Pair start error:', e.message));
    return res.send(`<html><head><meta http-equiv="refresh" content="4;url=/admin/scan/${id}"></head>
      <body style="${S}"><h2>⏳ Code aa raha hai...</h2><p>4 second mein automatically dikhega</p></body></html>`);
  }

  // Show pairing code if ready
  const pairingCode = getPairingCode(id);
  if (pairingCode) {
    return res.send(`<html><head><meta http-equiv="refresh" content="60;url=/admin/scan/${id}"></head>
      <body style="${S}">
        <h2>📱 WhatsApp Pairing Code</h2>
        <p style="color:#555">WhatsApp → ⋮ Menu → Linked Devices → Link a Device → <b>Link with phone number</b></p>
        <div style="background:white;border-radius:16px;padding:30px;display:inline-block;margin:20px;box-shadow:0 4px 20px rgba(0,0,0,0.15)">
          <p style="color:#aaa;font-size:13px;margin:0 0 10px">Yeh code daalo WhatsApp mein:</p>
          <h1 style="font-size:48px;letter-spacing:12px;color:#25d366;margin:0;font-family:monospace">${pairingCode}</h1>
        </div>
        <p style="color:#e74c3c;font-size:14px">⚠️ Code 60 second tak valid hai — jaldi daalo</p>
        <p style="color:#aaa;font-size:12px">Page 60 sec mein auto-refresh hoga</p>
        ${formHtml}
      </body></html>`);
  }

  // Show QR if ready
  const qr = await getQRImage(id);
  if (qr) {
    return res.send(`<html><head><meta http-equiv="refresh" content="18"></head>
      <body style="${S}">
        <h2>📱 WhatsApp QR Scan Karo</h2>
        <p style="color:#555">WhatsApp Business → Linked Devices → Link a Device</p>
        <img src="${qr}" style="width:320px;height:320px;border:8px solid white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.2);margin:10px 0"/>
        <p style="color:#e74c3c;font-size:13px">⚠️ QR 20 sec mein change hota hai — jaldi scan karo</p>
        ${formHtml}
      </body></html>`);
  }

  // Loading
  res.send(`<html><head><meta http-equiv="refresh" content="60"></head>
    <body style="${S}">
      <h2>⏳ Connect ho raha hai...</h2>
      <p>Number daal ke Code Bhejo button dabao</p>
      ${formHtml}
    </body></html>`);
});

router.use(auth);

// GET /admin/clients
router.get('/clients', (req, res) => {
  try {
    const clients = db.get('clients').orderBy('createdAt', 'desc').value();
    const withStatus = clients.map(c => ({ ...c, waStatus: getStatus(c.id) }));
    console.log('[Admin] GET /clients —', clients.length, 'found');
    res.json({ clients: withStatus });
  } catch (err) {
    console.error('[Admin] GET /clients:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients
router.post('/clients', (req, res) => {
  try {
    const { name, aiProvider, aiKey, systemPrompt, plan, googleSheetWebhook, reportPhone,
            clientUsername, clientPassword, permissions,
            greenApiInstanceId, greenApiToken, ownerPhone, leadGroup,
            metaPhoneNumberId, metaAccessToken, metaVerifyToken, metaWabaId,
            businessHoursEnabled, businessHoursStart, businessHoursEnd, businessClosedMessage, typingDelayEnabled } = req.body;
    console.log('[Admin] POST /clients — name:', name);
    if (!name || !aiProvider || !aiKey || !systemPrompt) {
      return res.status(400).json({ error: 'name, aiProvider, aiKey, systemPrompt required' });
    }
    const crypto = require('crypto');
    const client = {
      id: crypto.randomUUID(),
      name, aiProvider, aiKey, systemPrompt,
      plan: plan || 'starter',
      googleSheetWebhook: googleSheetWebhook || '',
      reportPhone: reportPhone || '',
      ownerPhone: ownerPhone || '',
      leadGroup: leadGroup || '',
      greenApiInstanceId: greenApiInstanceId || '',
      greenApiToken: greenApiToken || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      clientUsername: clientUsername || '',
      clientPassword: clientPassword || '',
      clientToken: crypto.randomUUID(),
      apiKey: crypto.randomUUID(),
      webhookUrl: '',
      permissions: permissions || {},
      metaPhoneNumberId: metaPhoneNumberId || '',
      metaAccessToken: metaAccessToken || '',
      metaVerifyToken: metaVerifyToken || '',
      metaWabaId: metaWabaId || '',
      businessHoursEnabled: businessHoursEnabled || false,
      businessHoursStart: businessHoursStart || '09:00',
      businessHoursEnd: businessHoursEnd || '20:00',
      businessClosedMessage: businessClosedMessage || 'Humari shop abhi band hai. Hum kal subah open hote hi aapko reply karenge.',
      typingDelayEnabled: typingDelayEnabled || false,
      onboardingComplete: false,
      onboardingStep: 0,
      onboardingData: {},
    };
    db.get('clients').push(client).write();
    console.log('[Admin] Client created:', client.id);

    // Auto-set webhook for this client's Green API instance
    if (greenApiInstanceId && greenApiToken) {
      greenApi.setWebhook(greenApi.WEBHOOK_URL, greenApiInstanceId, greenApiToken)
        .then(() => console.log('[Admin] Webhook set for new client:', name))
        .catch(e => console.error('[Admin] Webhook set error:', e.message));
    }

    res.json({ ...client, waStatus: 'close' });
  } catch (err) {
    console.error('[Admin] POST /clients:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/clients/:id
router.put('/clients/:id', (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    // Only update fields that are actually provided — don't wipe missing ones
    const updates = {};
    if (body.name !== undefined)               updates.name = body.name;
    if (body.aiProvider !== undefined)         updates.aiProvider = body.aiProvider;
    if (body.aiKey !== undefined)              updates.aiKey = body.aiKey;
    if (body.systemPrompt !== undefined && body.systemPrompt !== 'dummy') updates.systemPrompt = body.systemPrompt;
    if (body.plan !== undefined)               updates.plan = body.plan;
    if (body.googleSheetWebhook !== undefined) updates.googleSheetWebhook = body.googleSheetWebhook;
    if (body.reportPhone !== undefined)        updates.reportPhone = body.reportPhone;
    if (body.clientUsername !== undefined)     updates.clientUsername = body.clientUsername;
    if (body.clientPassword !== undefined)     updates.clientPassword = body.clientPassword;
    if (body.permissions !== undefined)          updates.permissions = body.permissions;
    if (body.greenApiInstanceId !== undefined)   updates.greenApiInstanceId = body.greenApiInstanceId;
    if (body.greenApiToken !== undefined)        updates.greenApiToken = body.greenApiToken;
    if (body.ownerPhone !== undefined)             updates.ownerPhone = body.ownerPhone;
    if (body.leadGroup !== undefined)              updates.leadGroup = body.leadGroup;
    if (body.webhookUrl !== undefined)             updates.webhookUrl = body.webhookUrl;
    if (body.metaPhoneNumberId !== undefined)      updates.metaPhoneNumberId = body.metaPhoneNumberId;
    if (body.metaAccessToken !== undefined)        updates.metaAccessToken = body.metaAccessToken;
    if (body.metaVerifyToken !== undefined)        updates.metaVerifyToken = body.metaVerifyToken;
    if (body.metaWabaId !== undefined)             updates.metaWabaId = body.metaWabaId;
    if (body.businessHoursEnabled !== undefined)   updates.businessHoursEnabled = body.businessHoursEnabled;
    if (body.businessHoursStart !== undefined)     updates.businessHoursStart = body.businessHoursStart;
    if (body.businessHoursEnd !== undefined)       updates.businessHoursEnd = body.businessHoursEnd;
    if (body.businessClosedMessage !== undefined)  updates.businessClosedMessage = body.businessClosedMessage;
    if (body.typingDelayEnabled !== undefined)     updates.typingDelayEnabled = body.typingDelayEnabled;
    if (body.botPhone !== undefined)               updates.botPhone = body.botPhone;
    db.get('clients').find({ id }).assign(updates).write();
    console.log('[Admin] Updated client:', id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] PUT /clients:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/clients/:id
router.delete('/clients/:id', (req, res) => {
  try {
    const { id } = req.params;
    disconnectClient(id);
    db.get('clients').remove({ id }).write();
    db.get('conversations').remove({ clientId: id }).write();
    console.log('[Admin] Deleted client:', id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] DELETE /clients:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/clients/:id/logs
router.get('/clients/:id/logs', (req, res) => {
  try {
    const { id } = req.params;
    const logs = db.get('conversations').filter({ clientId: id }).orderBy('lastUpdated', 'desc').take(100).value();
    console.log('[Admin] Logs for', id, ':', logs.length);
    res.json({ logs });
  } catch (err) {
    console.error('[Admin] GET /logs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/toggle
router.post('/clients/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const client = db.get('clients').find({ id }).value();
    if (!client) return res.status(404).json({ error: 'Not found' });
    const newStatus = client.status === 'active' ? 'inactive' : 'active';
    db.get('clients').find({ id }).assign({ status: newStatus }).write();
    if (newStatus === 'active' && !client.metaPhoneNumberId) {
      bootClientSession(id, db).catch(e => console.error('[Admin] bootClientSession error:', e.message));
    } else if (newStatus === 'inactive') {
      disconnectClient(id);
    }
    console.log('[Admin] Toggled', id, '->', newStatus);
    res.json({ status: newStatus });
  } catch (err) {
    console.error('[Admin] toggle:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/connect — start WhatsApp session (QR or pairing code)
router.post('/clients/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber } = req.body; // pairing phone (optional)
    const client = db.get('clients').find({ id }).value();
    if (!client) return res.status(404).json({ error: 'Client not found' });
    console.log('[Admin] Connect request for:', client.name, phoneNumber ? `(pairing: ${phoneNumber})` : '(QR)');
    // Force restart when pairing phone given, otherwise let startClient decide
    startClient(id, phoneNumber || null).catch(e => console.error('[WA] startClient error:', e.message));
    const mode = phoneNumber ? 'pairing' : 'qr';
    res.json({ message: mode === 'pairing' ? 'Pairing code 10-15 sec mein aayega' : 'QR ready hone mein 15-20 sec lagenge', mode });
    console.log('[Admin] startClient called, mode:', mode);
  } catch (err) {
    console.error('[Admin] connect:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/clients/:id/qr — get QR code image or pairing code
router.get('/clients/:id/qr', async (req, res) => {
  try {
    const { id } = req.params;
    const status = getStatus(id);
    if (status === 'open') return res.json({ status: 'open', qr: null, pairingCode: null });
    const rawQr = getQRImage(id);
    const pairingCode = getPairingCode(id);

    let qr = null;
    if (rawQr) {
      try {
        const QRCode = require('qrcode');
        qr = await QRCode.toDataURL(rawQr, { width: 300, margin: 2 });
      } catch (e) {
        qr = rawQr;
      }
    }

    res.json({ status, qr, pairingCode });
  } catch (err) {
    console.error('[Admin] QR:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// GET /admin/clients/:id/groups — list all WhatsApp groups
router.get('/clients/:id/groups', async (req, res) => {
  try {
    const groups = await getGroups(req.params.id);
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/disconnect
router.post('/clients/:id/disconnect', (req, res) => {
  try {
    const { id } = req.params;
    disconnectClient(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/send-report — manual report trigger
router.post('/clients/:id/send-report', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[Admin] Manual report request for:', id);
    const result = await sendReportToClient(id);
    if (result.success) {
      res.json({ success: true, message: 'Report bhej di gayi!' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('[Admin] send-report:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/clients/:id/preview-report — report preview
router.get('/clients/:id/preview-report', (req, res) => {
  try {
    const { id } = req.params;
    const report = generateReport(id);
    if (!report) return res.status(404).json({ error: 'Client not found' });
    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/clients/:id/api-credentials — get API key + instanceId
router.get('/clients/:id/api-credentials', (req, res) => {
  try {
    const { id } = req.params;
    const client = db.get('clients').find({ id }).value();
    if (!client) return res.status(404).json({ error: 'Not found' });
    const crypto = require('crypto');
    if (!client.apiKey) {
      db.get('clients').find({ id }).assign({ apiKey: crypto.randomUUID() }).write();
    }
    const fresh = db.get('clients').find({ id }).value();
    res.json({ instanceId: fresh.id, apiKey: fresh.apiKey, webhookUrl: fresh.webhookUrl || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/regen-apikey — generate new API key
router.post('/clients/:id/regen-apikey', (req, res) => {
  try {
    const { id } = req.params;
    const crypto = require('crypto');
    const newKey = crypto.randomUUID();
    db.get('clients').find({ id }).assign({ apiKey: newKey }).write();
    console.log('[Admin] API key regenerated for:', id);
    res.json({ apiKey: newKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/send-message — manually send a message from inbox
router.post('/clients/:id/send-message', async (req, res) => {
  try {
    const { id } = req.params;
    const { to, text } = req.body;
    if (!to || !text?.trim()) return res.status(400).json({ error: 'to aur text required hain' });

    const { sendMessage } = require('../services/wa-sessions');
    await sendMessage(id, to, text.trim());

    const convId = `${id}_${to}`;
    const conv = db.get('conversations').find({ id: convId }).value();
    const newMsg = { role: 'assistant', content: text.trim(), timestamp: new Date().toISOString(), manual: true };
    if (conv) {
      const messages = [...(conv.messages || []), newMsg];
      db.get('conversations').find({ id: convId }).assign({ messages, lastUpdated: new Date().toISOString() }).write();
    } else {
      db.get('conversations').push({ id: convId, clientId: id, userPhone: to, messages: [newMsg], lastUpdated: new Date().toISOString(), botEnabled: true, status: 'open' }).write();
    }

    console.log('[Admin] Manual message sent to', to);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] send-message:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/conversations/:convId/bot-toggle
router.post('/clients/:id/conversations/:convId/bot-toggle', (req, res) => {
  try {
    const { convId } = req.params;
    const conv = db.get('conversations').find({ id: convId }).value();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const newVal = conv.botEnabled === false ? true : false;
    db.get('conversations').find({ id: convId }).assign({ botEnabled: newVal }).write();
    res.json({ success: true, botEnabled: newVal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/conversations/:convId/resolve
router.post('/clients/:id/conversations/:convId/resolve', (req, res) => {
  try {
    const { convId } = req.params;
    const conv = db.get('conversations').find({ id: convId }).value();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const newStatus = conv.status === 'resolved' ? 'open' : 'resolved';
    db.get('conversations').find({ id: convId }).assign({ status: newStatus }).write();
    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/clients/:id/bulk-send — broadcast message to multiple numbers
router.post('/clients/:id/bulk-send', async (req, res) => {
  try {
    const { id } = req.params;
    const { numbers, message } = req.body;
    if (!numbers?.length || !message?.trim()) return res.status(400).json({ error: 'numbers aur message required' });

    const client = db.get('clients').find({ id }).value();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const results = { sent: 0, failed: 0, errors: [] };
    for (const num of numbers) {
      const clean = String(num).replace(/\D/g, '');
      if (!clean || clean.length < 10) { results.failed++; continue; }
      try {
        await sendMessage(id, clean, message.trim());
        results.sent++;
      } catch (e) {
        results.failed++;
        results.errors.push({ number: clean, error: e.message });
      }
      await new Promise(r => setTimeout(r, 500)); // 500ms delay between messages
    }
    console.log(`[Admin] Bulk send done — sent: ${results.sent}, failed: ${results.failed}`);
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[Admin] bulk-send:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
