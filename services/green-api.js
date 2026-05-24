const axios = require('axios');

const DEFAULT_INSTANCE = process.env.GREEN_API_INSTANCE_ID || '7107608885';
const DEFAULT_TOKEN    = process.env.GREEN_API_TOKEN || '';
const WEBHOOK_URL      = `${process.env.BASE_URL || 'https://api.shivangiautoclinic.com'}/green-webhook`;

function base(instanceId) {
  return `https://api.green-api.com/waInstance${instanceId}`;
}

async function sendMessage(to, text, instanceId = DEFAULT_INSTANCE, apiToken = DEFAULT_TOKEN) {
  let number = to.replace(/\D/g, '');
  if (number.length === 10) number = '91' + number;
  const chatId = `${number}@c.us`;
  const res = await axios.post(`${base(instanceId)}/sendMessage/${apiToken}`, { chatId, message: text });
  console.log('[GreenAPI] Sent to', chatId, '| idMessage:', res.data?.idMessage);
  return res.data;
}

async function sendToGroup(groupId, text, instanceId = DEFAULT_INSTANCE, apiToken = DEFAULT_TOKEN) {
  const chatId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
  const res = await axios.post(`${base(instanceId)}/sendMessage/${apiToken}`, { chatId, message: text });
  console.log('[GreenAPI] Group sent to', chatId);
  return res.data;
}

async function setWebhook(webhookUrl, instanceId = DEFAULT_INSTANCE, apiToken = DEFAULT_TOKEN) {
  const res = await axios.post(`${base(instanceId)}/setSettings/${apiToken}`, {
    webhookUrl,
    incomingWebhook: 'yes',
    outgoingWebhook: 'no',
    deviceWebhook: 'no',
    statusInstanceWebhook: 'no',
    stateWebhook: 'no',
  });
  return res.data;
}

module.exports = { sendMessage, sendToGroup, setWebhook, WEBHOOK_URL };
