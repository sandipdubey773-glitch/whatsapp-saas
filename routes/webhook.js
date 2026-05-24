const express = require('express');
const router = express.Router();
const db = require('../db');
const { callAI } = require('../services/ai');
const { sendMessage } = require('../services/whatsapp');

// GET /webhook — WhatsApp verification
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log('[Webhook] Verification — mode:', mode);
  if (mode === 'subscribe' && token === process.env.ADMIN_TOKEN) {
    console.log('[Webhook] Verified!');
    return res.status(200).send(challenge);
  }
  console.warn('[Webhook] Verification failed');
  res.status(403).json({ error: 'Forbidden' });
});

// POST /webhook — Incoming WhatsApp messages
router.post('/', async (req, res) => {
  res.status(200).json({ status: 'ok' });
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages?.[0]) return;

    const waPhoneId = value.metadata?.phone_number_id;
    const message = value.messages[0];
    const userPhone = message.from;
    const userText = message.text?.body;
    if (!userText) return;

    console.log('[Webhook] Message from:', userPhone, '| PhoneId:', waPhoneId);

    // Find active client
    const client = db.get('clients').find({ waPhoneId, status: 'active' }).value();
    if (!client) {
      console.warn('[Webhook] No active client for phoneId:', waPhoneId);
      return;
    }
    console.log('[Webhook] Client matched:', client.name);

    // Load / create conversation
    const convId = `${client.id}_${userPhone}`;
    let conv = db.get('conversations').find({ id: convId }).value();
    let messages = conv?.messages || [];

    messages.push({ role: 'user', content: userText, timestamp: new Date().toISOString() });
    if (messages.length > 20) messages = messages.slice(-20);

    // Call AI
    const aiReply = await callAI({
      provider: client.aiProvider,
      apiKey: client.aiKey,
      systemPrompt: client.systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    messages.push({ role: 'assistant', content: aiReply, timestamp: new Date().toISOString() });

    // Save conversation
    if (conv) {
      db.get('conversations').find({ id: convId }).assign({ messages, lastUpdated: new Date().toISOString() }).write();
    } else {
      db.get('conversations').push({ id: convId, clientId: client.id, clientName: client.name, userPhone, messages, lastUpdated: new Date().toISOString() }).write();
    }
    console.log('[Webhook] Conversation saved:', convId);

    // Send WhatsApp reply
    await sendMessage({ waPhoneId, waToken: client.waToken, to: userPhone, message: aiReply });

  } catch (err) {
    console.error('[Webhook] Error:', err.message);
  }
});

module.exports = router;
