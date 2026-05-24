const axios = require('axios');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callAI({ provider, apiKey, systemPrompt, messages, imageData = null }) {
  console.log('[AI] Provider:', provider, '| Messages:', messages.length);
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (provider === 'gemini') return await callGemini(apiKey, systemPrompt, messages, imageData);
      if (provider === 'openai') return await callOpenAI(apiKey, systemPrompt, messages);
      if (provider === 'claude') return await callClaude(apiKey, systemPrompt, messages);
      if (provider === 'openrouter') return await callOpenRouter(apiKey, systemPrompt, messages);
      if (provider === 'groq') return await callGroq(apiKey, systemPrompt, messages);
      throw new Error('Unknown AI provider: ' + provider);
    } catch (err) {
      const status = err.response?.status;
      const isRetryable = status === 503 || status === 429 || status === 500;
      if (isRetryable && attempt < maxRetries) {
        // Gemini 429 response mein "retry in Xs" hota hai — use that + buffer
        let wait = attempt * 15000; // default: 15s, 30s
        if (status === 429) {
          const msg = err.response?.data?.error?.message || '';
          const match = msg.match(/retry in ([\d.]+)s/i);
          if (match) wait = Math.ceil(parseFloat(match[1]) * 1000) + 3000;
        }
        console.log(`[AI] ${provider} ${status} — retry ${attempt}/${maxRetries} in ${Math.round(wait/1000)}s`);
        await sleep(wait);
        continue;
      }
      console.error('[AI] Error from', provider, ':', err.response?.data || err.message);
      throw err;
    }
  }
}

async function callGemini(apiKey, systemPrompt, messages, imageData = null) {
  const contents = messages.map((m, idx) => {
    const isLast = idx === messages.length - 1;
    const parts = [];

    // Image sirf last user message ke saath bhejo
    if (isLast && m.role === 'user' && imageData) {
      parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
    }

    parts.push({ text: m.content || '.' });

    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  // Image ho toh vision model use karo
  const model = imageData ? 'gemini-1.5-flash' : 'gemini-2.5-flash-lite';
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
    }
  );

  const reply = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log('[AI] Gemini reply length:', reply.length, imageData ? `(${model} with image)` : '');
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
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  );
  const reply = res.data.content?.[0]?.text || '';
  console.log('[AI] Claude reply length:', reply.length);
  return reply;
}

async function callOpenAI(apiKey, systemPrompt, messages) {
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );

  const reply = res.data.choices?.[0]?.message?.content || '';
  console.log('[AI] OpenAI reply length:', reply.length);
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
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://whatsapp-saas.app',
      },
    }
  );

  const reply = res.data.choices?.[0]?.message?.content || '';
  console.log('[AI] OpenRouter reply length:', reply.length);
  return reply;
}

async function callGroq(apiKey, systemPrompt, messages) {
  const res = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))],
      max_tokens: 1024,
    },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
  const reply = res.data.choices?.[0]?.message?.content || '';
  console.log('[AI] Groq reply length:', reply.length);
  return reply;
}

module.exports = { callAI };
