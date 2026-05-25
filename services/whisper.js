const axios = require('axios');
const FormData = require('form-data');

async function transcribeAudio(audioBuffer, apiKey) {
  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'text');
  form.append('language', 'hi');

  const res = await axios.post(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    form,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      timeout: 30000,
    }
  );

  const text = typeof res.data === 'string' ? res.data : (res.data?.text || '');
  console.log('[Whisper] Transcribed:', text.slice(0, 100));
  return text.trim();
}

module.exports = { transcribeAudio };
