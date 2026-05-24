const express = require('express');
const router = express.Router();
const db = require('../db');
const clientAuth = require('../middleware/clientAuth');
const { getStatus } = require('../services/wa-sessions');
const { sendReportToClient, generateReport } = require('../services/reporter');
const metaApi = require('../services/meta-api');

// POST /client/login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username aur password required' });

    const client = db.get('clients').find({ clientUsername: username, clientPassword: password }).value();
    if (!client) return res.status(401).json({ error: 'Wrong username ya password' });

    res.json({
      clientToken: client.clientToken,
      name: client.name,
      permissions: client.permissions || {},
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All routes below require client auth
router.use(clientAuth);

// GET /client/me — client info + permissions
router.get('/me', (req, res) => {
  const c = req.clientData;
  res.json({
    id: c.id,
    name: c.name,
    plan: c.plan,
    aiProvider: c.aiProvider,
    waStatus: getStatus(c.id),
    permissions: c.permissions || {},
    createdAt: c.createdAt,
  });
});

// GET /client/logs
router.get('/logs', (req, res) => {
  const c = req.clientData;
  if (!c.permissions?.viewLogs) return res.status(403).json({ error: 'Permission nahi hai' });

  const logs = db.get('conversations')
    .filter({ clientId: c.id })
    .orderBy('lastUpdated', 'desc')
    .take(100)
    .value();
  res.json({ logs });
});

// GET /client/stats
router.get('/stats', (req, res) => {
  const c = req.clientData;
  if (!c.permissions?.viewStats) return res.status(403).json({ error: 'Permission nahi hai' });

  const today = new Date().toISOString().split('T')[0];
  const allConvs = db.get('conversations').filter({ clientId: c.id }).value();
  const todayConvs = allConvs.filter(conv => conv.lastUpdated?.startsWith(today));
  const totalMsgs = allConvs.reduce((sum, conv) => sum + (conv.messages?.length || 0), 0);

  res.json({
    totalConversations: allConvs.length,
    todayConversations: todayConvs.length,
    totalMessages: totalMsgs,
    waStatus: getStatus(c.id),
  });
});

// POST /client/toggle
router.post('/toggle', (req, res) => {
  const c = req.clientData;
  if (!c.permissions?.toggleBot) return res.status(403).json({ error: 'Permission nahi hai' });

  const newStatus = c.status === 'active' ? 'inactive' : 'active';
  db.get('clients').find({ id: c.id }).assign({ status: newStatus }).write();
  res.json({ status: newStatus });
});

// POST /client/send-report
router.post('/send-report', async (req, res) => {
  const c = req.clientData;
  if (!c.permissions?.sendReport) return res.status(403).json({ error: 'Permission nahi hai' });

  const result = await sendReportToClient(c.id);
  if (result.success) res.json({ success: true });
  else res.status(400).json({ error: result.error });
});

// GET /client/report-preview
router.get('/report-preview', (req, res) => {
  const c = req.clientData;
  if (!c.permissions?.viewReportPreview) return res.status(403).json({ error: 'Permission nahi hai' });

  const report = generateReport(c.id);
  res.json({ report });
});

// GET /client/prompt
router.get('/prompt', (req, res) => {
  const c = req.clientData;
  if (!c.permissions?.editPrompt) return res.status(403).json({ error: 'Permission nahi hai' });
  res.json({ systemPrompt: c.systemPrompt });
});

// PUT /client/prompt
router.put('/prompt', (req, res) => {
  const c = req.clientData;
  if (!c.permissions?.editPrompt) return res.status(403).json({ error: 'Permission nahi hai' });

  const { systemPrompt } = req.body;
  if (!systemPrompt) return res.status(400).json({ error: 'systemPrompt required' });
  db.get('clients').find({ id: c.id }).assign({ systemPrompt }).write();
  res.json({ success: true });
});

// GET /client/meta-config
router.get('/meta-config', (req, res) => {
  const c = req.clientData;
  res.json({
    metaPhoneNumberId: c.metaPhoneNumberId || '',
    metaVerifyToken: c.metaVerifyToken || '',
    hasAccessToken: !!(c.metaAccessToken),
    webhookUrl: 'https://shivangi-saas-bot.onrender.com/meta/webhook',
  });
});

// PUT /client/meta-config
router.put('/meta-config', (req, res) => {
  const c = req.clientData;
  const { metaPhoneNumberId, metaAccessToken, metaVerifyToken } = req.body;
  const updates = {};
  if (metaPhoneNumberId !== undefined) updates.metaPhoneNumberId = metaPhoneNumberId;
  if (metaAccessToken)                 updates.metaAccessToken = metaAccessToken;
  if (metaVerifyToken !== undefined)   updates.metaVerifyToken = metaVerifyToken;
  db.get('clients').find({ id: c.id }).assign(updates).write();
  res.json({ success: true });
});

// GET /client/inbox — conversations list
router.get('/inbox', (req, res) => {
  const c = req.clientData;
  const logs = db.get('conversations')
    .filter({ clientId: c.id })
    .orderBy('lastUpdated', 'desc')
    .take(200)
    .value();
  res.json({ logs: logs.filter(l => !l.id?.includes('_owner_chat')) });
});

// POST /client/send-message — manually send message
router.post('/send-message', async (req, res) => {
  const c = req.clientData;
  const { to, text } = req.body;
  if (!to || !text?.trim()) return res.status(400).json({ error: 'to aur text required' });
  try {
    const { sendMessage } = require('../services/wa-sessions');
    await sendMessage(c.id, to, text.trim());
    const convId = `${c.id}_${to}`;
    const conv = db.get('conversations').find({ id: convId }).value();
    const newMsg = { role: 'assistant', content: text.trim(), timestamp: new Date().toISOString(), manual: true };
    if (conv) {
      db.get('conversations').find({ id: convId }).assign({ messages: [...(conv.messages || []), newMsg], lastUpdated: new Date().toISOString() }).write();
    } else {
      db.get('conversations').push({ id: convId, clientId: c.id, userPhone: to, messages: [newMsg], lastUpdated: new Date().toISOString(), botEnabled: true, status: 'open' }).write();
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /client/conversations/:convId/bot-toggle
router.post('/conversations/:convId/bot-toggle', (req, res) => {
  const { convId } = req.params;
  const conv = db.get('conversations').find({ id: convId }).value();
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const newVal = conv.botEnabled === false ? true : false;
  db.get('conversations').find({ id: convId }).assign({ botEnabled: newVal }).write();
  res.json({ success: true, botEnabled: newVal });
});

// POST /client/conversations/:convId/resolve
router.post('/conversations/:convId/resolve', (req, res) => {
  const { convId } = req.params;
  const conv = db.get('conversations').find({ id: convId }).value();
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const newStatus = conv.status === 'resolved' ? 'open' : 'resolved';
  db.get('conversations').find({ id: convId }).assign({ status: newStatus }).write();
  res.json({ success: true, status: newStatus });
});

// POST /client/meta-test
router.post('/meta-test', async (req, res) => {
  const c = req.clientData;
  if (!c.metaPhoneNumberId || !c.metaAccessToken) {
    return res.status(400).json({ error: 'Pehle Meta credentials save karo' });
  }
  const phone = req.body.to || c.reportPhone || c.ownerPhone;
  if (!phone) return res.status(400).json({ error: 'Test ke liye phone number do' });
  try {
    await metaApi.sendMessage(c.metaPhoneNumberId, c.metaAccessToken, phone,
      '✅ Test successful! Tumhara WhatsApp bot sahi se connected hai. 🤖');
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
