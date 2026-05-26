const axios = require('axios');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Key Rotation State (in-memory) ---
const keyCooldowns = new Map();    // apiKey → cooldownUntil (ms timestamp)
const clientKeyIndexes = new Map(); // `clientId_provider` → current index

function getNextKey(keys, indexKey) {
  const now = Date.now();
  const available = keys.filter(k => (keyCooldowns.get(k) || 0) < now);
  const pool = available.length > 0 ? available : keys; // fallback: use all even if cooling
  const idx = (clientKeyIndexes.get(indexKey) || 0) % pool.length;
  clientKeyIndexes.set(indexKey, (idx + 1) % pool.length);
  return pool[idx];
}

function getKeyStatus(keys) {
  const now = Date.now();
  return keys.map((k, i) => {
    const coolUntil = keyCooldowns.get(k) || 0;
    const isCooling = coolUntil > now;
    return { index: i + 1, status: isCooling ? 'cooling' : 'active', coolSecsLeft: isCooling ? Math.round((coolUntil - now) / 1000) : 0 };
  });
}

async function callAI({ provider, apiKey, apiKeys, systemPrompt, messages, imageData = null, clientId = 'default' }) {
  // Build keys array — apiKeys array takes priority, fallback to single apiKey
  const keys = (apiKeys || []).filter(Boolean).length
    ? (apiKeys || []).filter(Boolean)
    : [apiKey].filter(Boolean);

  if (keys.length === 0) throw new Error('No API key provided');

  const indexKey = `${clientId}_${provider}`;
  // Max attempts = each key tried at least once + 2 extra for 503/500 retries
  const maxAttempts = keys.length + 2;

  console.log(`[AI] Provider: ${provider} | Keys: ${keys.length} | Messages: ${messages.length}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const currentKey = getNextKey(keys, indexKey);
    const keyLabel = keys.length > 1 ? ` [key ${keys.indexOf(currentKey) + 1}/${keys.length}]` : '';
    try {
      if (provider === 'gemini')     return await callGemini(currentKey, systemPrompt, messages, imageData);
      if (provider === 'openai')     return await callOpenAI(currentKey, systemPrompt, messages, imageData);
      if (provider === 'claude')     return await callClaude(currentKey, systemPrompt, messages);
      if (provider === 'openrouter') return await callOpenRouter(currentKey, systemPrompt, messages);
      if (provider === 'groq')       return await callGroq(currentKey, systemPrompt, messages, imageData);
      throw new Error('Unknown AI provider: ' + provider);
    } catch (err) {
      const status = err.response?.status;

      if (status === 429) {
        // Cooldown this specific key, immediately try next
        const msg = err.response?.data?.error?.message || '';
        const retryMatch = msg.match(/retry in ([\d.]+)s/i);
        const coolMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 2000 : 60000;
        keyCooldowns.set(currentKey, Date.now() + coolMs);
        console.log(`[AI] ${provider}${keyLabel} rate limited — cooling ${Math.round(coolMs/1000)}s — switching key (attempt ${attempt}/${maxAttempts})`);
        continue; // try next key immediately
      }

      if ((status === 503 || status === 500) && attempt < maxAttempts) {
        const wait = attempt * 8000;
        console.log(`[AI] ${provider}${keyLabel} ${status} — retry in ${wait/1000}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }

      console.error(`[AI] Error from ${provider}${keyLabel}:`, err.response?.data || err.message);
      throw err;
    }
  }
  throw new Error(`[AI] All ${keys.length} key(s) exhausted for ${provider}`);
}

async function callGemini(apiKey, systemPrompt, messages, imageData = null) {
  const contents = messages.map((m, idx) => {
    const isLast = idx === messages.length - 1;
    const parts = [];
    if (isLast && m.role === 'user' && imageData) {
      parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
    }
    parts.push({ text: m.content || '.' });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  const model = imageData ? 'gemini-1.5-flash' : 'gemini-2.5-flash-lite';
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { system_instruction: { parts: [{ text: systemPrompt }] }, contents }
  );
  const reply = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log('[AI] Gemini reply length:', reply.length, imageData ? `(${model} vision)` : '');
  return reply;
}

async function callClaude(apiKey, systemPrompt, messages) {
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    },
    { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
  );
  const reply = res.data.content?.[0]?.text || '';
  console.log('[AI] Claude reply length:', reply.length);
  return reply;
}

async function callOpenAI(apiKey, systemPrompt, messages, imageData = null) {
  const formattedMessages = messages.map((m, idx) => {
    const isLast = idx === messages.length - 1;
    if (isLast && m.role === 'user' && imageData) {
      return {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.data}` } },
          { type: 'text', text: m.content || 'Is image mein kya problem hai?' },
        ],
      };
    }
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
  });

  const model = imageData ? 'gpt-4o' : 'gpt-4o-mini';
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    { model, messages: [{ role: 'system', content: systemPrompt }, ...formattedMessages] },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
  const reply = res.data.choices?.[0]?.message?.content || '';
  console.log('[AI] OpenAI reply length:', reply.length, imageData ? `(${model} vision)` : '');
  return reply;
}

async function callOpenRouter(apiKey, systemPrompt, messages) {
  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://whatsapp-saas.app' },
    }
  );
  const reply = res.data.choices?.[0]?.message?.content || '';
  console.log('[AI] OpenRouter reply length:', reply.length);
  return reply;
}

async function callGroq(apiKey, systemPrompt, messages, imageData = null) {
  const formattedMessages = messages.map((m, idx) => {
    const isLast = idx === messages.length - 1;
    if (isLast && m.role === 'user' && imageData) {
      return {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.data}` } },
          { type: 'text', text: m.content || 'Is image mein kya problem hai?' },
        ],
      };
    }
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
  });

  const model = imageData ? 'llama-3.2-90b-vision-preview' : 'llama-3.3-70b-versatile';
  const res = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    { model, messages: [{ role: 'system', content: systemPrompt }, ...formattedMessages], max_tokens: 1024 },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
  const reply = res.data.choices?.[0]?.message?.content || '';
  console.log('[AI] Groq reply length:', reply.length, imageData ? '(vision)' : '');
  return reply;
}

module.exports = { callAI, getKeyStatus };
