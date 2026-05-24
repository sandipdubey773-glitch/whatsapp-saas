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

async function getTemplates(wabaId, accessToken) {
  try {
    const res = await axios.get(`${GRAPH_URL}/${wabaId}/message_templates`, {
      params: { access_token: accessToken, fields: 'name,status,language,components', limit: 100 },
      timeout: 10000,
    });
    return res.data?.data || [];
  } catch (e) {
    const err = e.response?.data?.error?.message || e.message;
    throw new Error(err);
  }
}

async function sendTemplate(phoneNumberId, accessToken, to, templateName, language, bodyVars) {
  const phone = String(to).replace(/\D/g, '');
  const recipient = phone.startsWith('91') ? phone : '91' + phone;
  const template = { name: templateName, language: { code: language || 'en' } };
  if (bodyVars && bodyVars.length > 0) {
    template.components = [{ type: 'body', parameters: bodyVars.map(v => ({ type: 'text', text: String(v) })) }];
  }
  try {
    const res = await axios.post(`${GRAPH_URL}/${phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to: recipient, type: 'template', template },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return res.data;
  } catch (e) {
    const err = e.response?.data?.error?.message || e.message;
    throw new Error(err);
  }
}

module.exports = { sendMessage, parseIncoming, getTemplates, sendTemplate };
