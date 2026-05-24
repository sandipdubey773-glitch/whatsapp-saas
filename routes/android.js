const express = require('express');
const router = express.Router();
const db = require('../db');
const { callAI } = require('../services/ai');

// GET /webhook/android/health — app ke "Test Connection" button ke liye
router.get('/webhook/android/health', (req, res) => {
  res.json({ status: 'ok', service: 'WhatsApp Android Bot', timestamp: new Date().toISOString() });
});

// POST /webhook/android — Android app yahan message bhejta hai
router.post('/webhook/android', async (req, res) => {
  const { sender, message, whatsapp_type } = req.body;

  if (!sender || !message) {
    return res.status(400).json({ error: 'sender and message required' });
  }

  console.log(`[AndroidBot] From: ${sender} | Type: ${whatsapp_type || 'personal'} | Msg: ${message}`);

  try {
    // Shivangi Auto Clinic ka config use karo
    const client = db.get('clients').find({ name: 'shivangi auto clinic' }).value();

    if (!client) {
      console.warn('[AndroidBot] Client not found in DB');
      return res.json({ reply: null });
    }

    // Conversation history (last 10 messages per sender)
    const convId = `android_${sender.replace(/\s+/g, '_')}`;
    let conv = db.get('conversations').find({ id: convId }).value();
    let messages = conv?.messages || [];

    // Aaj ki date bata do AI ko (LEAD_READY ke liye)
    const today = new Date().toISOString().split('T')[0];
    const systemWithDate = `Today's date: ${today}\n\n${client.systemPrompt}`;

    messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    if (messages.length > 20) messages = messages.slice(-20);

    const rawReply = await callAI({
      provider: client.aiProvider,
      apiKey: client.aiKey,
      systemPrompt: systemWithDate,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    // LEAD_READY tag hata do — WhatsApp notification mein nahi jaana chahiye
    const cleanReply = rawReply.replace(/\[LEAD_READY:[^\]]*\]/g, '').trim();

    messages.push({ role: 'assistant', content: rawReply, timestamp: new Date().toISOString() });

    // Conversation save karo
    if (conv) {
      db.get('conversations').find({ id: convId }).assign({ messages, lastUpdated: new Date().toISOString() }).write();
    } else {
      db.get('conversations').push({
        id: convId,
        clientId: client.id,
        clientName: client.name,
        userPhone: sender,
        messages,
        lastUpdated: new Date().toISOString()
      }).write();
    }

    console.log(`[AndroidBot] Reply to ${sender}: ${cleanReply.slice(0, 80)}...`);
    res.json({ reply: cleanReply || null });

  } catch (err) {
    console.error('[AndroidBot] Error:', err.message);
    res.status(500).json({ reply: null });
  }
});

module.exports = router;
