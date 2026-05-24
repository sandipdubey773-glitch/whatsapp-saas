const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const db = require('../db');
const {
  sendMessage, getStatus, getQRImage, getPairingCode,
  rebootClient, logoutClient,
  receiveNotification, deleteNotification, clearNotifications,
} = require('../services/wa-sessions');

// ─── Auth helper ────────────────────────────────────────────────────────────
function authClient(req, res) {
  const { instanceId, apiToken } = req.params;
  const client = db.get('clients').find({ id: instanceId }).value();
  if (!client || client.apiKey !== apiToken) {
    res.status(401).json({ error: 'Invalid instanceId or apiToken' });
    return null;
  }
  if (client.status !== 'active') {
    res.status(403).json({ error: 'Instance is inactive' });
    return null;
  }
  return client;
}

function phoneFromChatId(chatId) {
  return String(chatId).replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');
}

function toChatId(phone) {
  const n = String(phone).replace(/\D/g, '');
  return (n.length === 10 ? '91' + n : n) + '@c.us';
}

// ─── 1. Get State ────────────────────────────────────────────────────────────
// GET /waInstance/:instanceId/getStateInstance/:apiToken
router.get('/waInstance/:instanceId/getStateInstance/:apiToken', (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  const status = getStatus();
  res.json({
    stateInstance: status === 'open' ? 'authorized' : 'notAuthorized',
    idInstance: client.id,
  });
});

// ─── 2. QR Code ──────────────────────────────────────────────────────────────
// GET /waInstance/:instanceId/qr/:apiToken
// Returns Green API-style QR response
router.get('/waInstance/:instanceId/qr/:apiToken', async (req, res) => {
  const client = authClient(req, res);
  if (!client) return;

  if (getStatus() === 'open') {
    return res.json({ type: 'alreadyLogged' });
  }

  const qr = getQRImage();
  if (!qr) {
    return res.json({ type: 'loading', message: 'QR is being generated, try again in a few seconds' });
  }

  try {
    const base64 = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
    res.json({
      type: 'qrCode',
      message: base64,
      time: Math.floor(Date.now() / 1000),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /waInstance/:instanceId/qr/:apiToken/image — returns QR as PNG directly
router.get('/waInstance/:instanceId/qr/:apiToken/image', async (req, res) => {
  const client = authClient(req, res);
  if (!client) return;

  if (getStatus() === 'open') {
    return res.status(409).json({ type: 'alreadyLogged' });
  }

  const qr = getQRImage();
  if (!qr) return res.status(404).json({ type: 'loading' });

  try {
    const buf = await QRCode.toBuffer(qr, { width: 280, margin: 2 });
    res.set('Content-Type', 'image/png').set('Cache-Control', 'no-store').send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 3. Send Message ─────────────────────────────────────────────────────────
// POST /waInstance/:instanceId/sendMessage/:apiToken
// Body: { chatId: "919876543210@c.us", message: "text" }
router.post('/waInstance/:instanceId/sendMessage/:apiToken', async (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  const { chatId, message } = req.body;
  if (!chatId || !message) return res.status(400).json({ error: 'chatId and message required' });
  try {
    await sendMessage(client.id, phoneFromChatId(chatId), message);
    res.json({ idMessage: `${Date.now()}`, status: 'sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /waInstance/:instanceId/sendTextMessage/:apiToken (alias)
// Body: { chatId: "...", textMessage: "text" }
router.post('/waInstance/:instanceId/sendTextMessage/:apiToken', async (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  const { chatId, textMessage, message } = req.body;
  const text = textMessage || message;
  if (!chatId || !text) return res.status(400).json({ error: 'chatId and textMessage required' });
  try {
    await sendMessage(client.id, phoneFromChatId(chatId), text);
    res.json({ idMessage: `${Date.now()}`, status: 'sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. Receive Notification ─────────────────────────────────────────────────
// GET /waInstance/:instanceId/receiveNotification/:apiToken
// Returns first message from queue (Green API style polling)
router.get('/waInstance/:instanceId/receiveNotification/:apiToken', (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  const notif = receiveNotification(client.id);
  if (!notif) return res.json(null);
  res.json(notif);
});

// DELETE /waInstance/:instanceId/deleteNotification/:apiToken/:receiptId
router.delete('/waInstance/:instanceId/deleteNotification/:apiToken/:receiptId', (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  const deleted = deleteNotification(client.id, req.params.receiptId);
  res.json({ result: deleted });
});

// ─── 5. Get Settings ─────────────────────────────────────────────────────────
// GET /waInstance/:instanceId/getSettings/:apiToken
router.get('/waInstance/:instanceId/getSettings/:apiToken', (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  res.json({
    wid: '',
    countryInstance: 'India',
    typeAccount: 'business',
    webhookUrl: client.webhookUrl || '',
    webhookUrlToken: '',
    delaySendMessagesMilliseconds: 1000,
    markIncomingMessagesReaded: false,
    markIncomingMessagesReadedOnReply: false,
    sharedSession: false,
    outgoingWebhook: client.webhookUrl ? 'yes' : 'no',
    outgoingMessageWebhook: 'yes',
    outgoingAPIMessageWebhook: 'yes',
    incomingWebhook: 'yes',
    deviceWebhook: 'no',
    statusInstanceWebhook: 'yes',
    stateWebhook: 'yes',
    enableMessagesHistory: 'no',
    keepOnlineStatus: 'no',
    pollMessageWebhook: 'yes',
    incomingBlockMessage: 'no',
  });
});

// POST /waInstance/:instanceId/setSettings/:apiToken
// Body: { webhookUrl: "https://..." }
router.post('/waInstance/:instanceId/setSettings/:apiToken', (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  const updates = {};
  if (req.body.webhookUrl !== undefined) updates.webhookUrl = req.body.webhookUrl;
  if (Object.keys(updates).length) {
    db.get('clients').find({ id: client.id }).assign(updates).write();
  }
  res.json({ saveSettings: 'SaveSettings completed successfully' });
});

// ─── 6. Logout ───────────────────────────────────────────────────────────────
// POST /waInstance/:instanceId/logout/:apiToken
router.post('/waInstance/:instanceId/logout/:apiToken', async (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  clearNotifications(client.id);
  await logoutClient();
  res.json({ isLogout: true });
});

// ─── 7. Reboot ───────────────────────────────────────────────────────────────
// POST /waInstance/:instanceId/reboot/:apiToken
router.post('/waInstance/:instanceId/reboot/:apiToken', async (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  await rebootClient();
  res.json({ isReboot: true });
});

// ─── 8. Get WA ID (check if number is on WhatsApp) ───────────────────────────
// POST /waInstance/:instanceId/checkWhatsapp/:apiToken
// Body: { phoneNumber: 919876543210 }
router.post('/waInstance/:instanceId/checkWhatsapp/:apiToken', (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber required' });
  res.json({
    existsWhatsapp: true,
    chatId: toChatId(String(phoneNumber)),
  });
});

// ─── 9. Get Profile Info ─────────────────────────────────────────────────────
// GET /waInstance/:instanceId/getContactInfo/:apiToken?chatId=...
router.get('/waInstance/:instanceId/getContactInfo/:apiToken', (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  const chatId = req.query.chatId || '';
  res.json({
    id: chatId,
    name: '',
    pushname: '',
    type: 'chat',
    isBusiness: false,
    isEnterprise: false,
    isMe: false,
    isUser: true,
    isGroup: false,
    isWAContact: true,
    isMyContact: false,
  });
});

// ─── 10. Clear Message Queue ─────────────────────────────────────────────────
// DELETE /waInstance/:instanceId/clearMessagesQueue/:apiToken
router.delete('/waInstance/:instanceId/clearMessagesQueue/:apiToken', (req, res) => {
  const client = authClient(req, res);
  if (!client) return;
  clearNotifications(client.id);
  res.json({ isCleared: true });
});

module.exports = router;
