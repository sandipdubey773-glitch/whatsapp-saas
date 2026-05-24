const axios = require('axios');

async function sendMessage({ waPhoneId, waToken, to, message }) {
  console.log('[WhatsApp] Sending to:', to, '| PhoneId:', waPhoneId);
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${waPhoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const msgId = res.data?.messages?.[0]?.id;
    console.log('[WhatsApp] Sent successfully, msg_id:', msgId);
    return res.data;
  } catch (err) {
    console.error('[WhatsApp] Send failed:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { sendMessage };
