const express = require('express');
const router = express.Router();
const metaApi = require('../services/meta-api');

// GET /meta/webhook — Meta verifies the endpoint on first setup
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const token     = req.query['hub.verify_token'];

  const db = require('../db');
  const client = db.get('clients').find({ metaVerifyToken: token, status: 'active' }).value();

  if (mode === 'subscribe' && client) {
    console.log('[Meta] Webhook verified for client:', client.name);
    return res.status(200).send(challenge);
  }
  console.warn('[Meta] Webhook verification failed — token:', token);
  return res.sendStatus(403);
});

// POST /meta/webhook — incoming messages from Meta Cloud API
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately — Meta retries if no 200

  const parsed = metaApi.parseIncoming(req.body);
  if (!parsed) return;

  const { phoneNumberId, from, text } = parsed;

  const db = require('../db');
  const client = db.get('clients').find({ metaPhoneNumberId: phoneNumberId, status: 'active' }).value();
  if (!client) {
    console.warn('[Meta] No active client found for phoneNumberId:', phoneNumberId);
    return;
  }

  const waSessions = require('../services/wa-sessions');
  waSessions.handleIncomingMeta(client, from, text).catch(e =>
    console.error('[Meta] handleIncomingMeta error:', e.message)
  );
});

module.exports = router;
