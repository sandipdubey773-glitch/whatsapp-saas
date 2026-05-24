const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

async function sendMessage(phoneNumberId, accessToken, to, text) {
  const phone = String(to).replace(/\D/g, '');
  const recipient = phone.startsWith('91') ? phone : '91' + phone;
  try {
    const res = await axios.post(
      `${GRAPH_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    console.log('[Meta] Sent to', recipient, '— msgId:', res.data?.messages?.[0]?.id);
    return res.data;
  } catch (e) {
    const err = e.response?.data?.error?.message || e.message;
    console.error('[Meta] Send error:', err);
    throw new Error(err);
  }
}

function parseIncoming(body) {
  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    const text = msg.text?.body || msg.interactive?.button_reply?.title || '';
    if (!text) return null;

    return {
      phoneNumberId: value?.metadata?.phone_number_id,
      from: msg.from,
      text,
      msgId: msg.id,
      timestamp: msg.timestamp,
    };
  } catch {
    return null;
  }
}

module.exports = { sendMessage, parseIncoming };
