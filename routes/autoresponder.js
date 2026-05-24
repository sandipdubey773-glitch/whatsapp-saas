const express = require('express');
const router = express.Router();
const db = require('../db');
const { callAI } = require('../services/ai');

async function handleAutoResponder(client, req, res) {
  const { conversation, message, sender, group } = req.body;
  if (!message || group) return res.json({ reply: null });

  console.log(`[AR:${client.name}] From: ${sender || conversation} | Msg: ${message.slice(0, 60)}`);

  try {
    const convId = `ar_${client.id.slice(0, 8)}_${(sender || conversation || '').replace(/\D/g, '').slice(-10)}`;
    let conv = db.get('conversations').find({ id: convId }).value();
    let messages = conv?.messages || [];

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

    const cleanReply = rawReply.replace(/\[LEAD_READY:[^\]]*\]/g, '').trim();
    messages.push({ role: 'assistant', content: rawReply, timestamp: new Date().toISOString() });

    if (conv) {
      db.get('conversations').find({ id: convId }).assign({ messages, lastUpdated: new Date().toISOString() }).write();
    } else {
      db.get('conversations').push({
        id: convId, clientId: client.id, clientName: client.name,
        userPhone: sender || conversation, messages, lastUpdated: new Date().toISOString()
      }).write();
    }

    console.log(`[AR] Reply: ${cleanReply.slice(0, 80)}...`);
    res.json({ reply: cleanReply || null });

  } catch (err) {
    console.error('[AR] Error:', err.message);
    res.json({ reply: null });
  }
}

// POST /autoresponder/:clientId — per-client webhook (AutoResponder app)
router.post('/autoresponder/:clientId', async (req, res) => {
  const client = db.get('clients').find({ id: req.params.clientId, status: 'active' }).value();
  if (!client) return res.json({ reply: null });
  await handleAutoResponder(client, req, res);
});

// POST /autoresponder — legacy route (hardcoded to shivangi auto clinic)
router.post('/autoresponder', async (req, res) => {
  const client = db.get('clients').find({ name: 'shivangi auto clinic' }).value();
  if (!client) return res.json({ reply: null });
  await handleAutoResponder(client, req, res);
});

module.exports = router;
