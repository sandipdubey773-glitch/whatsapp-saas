const axios = require('axios');
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

const FB_BASE = 'https://shivangi-auto-clinic-99030-default-rtdb.firebaseio.com';

function sanitizeKey(k) {
  return k
    .replace(/\./g, '_dot_')
    .replace(/@/g, '_at_')
    .replace(/#/g, '_hash_')
    .replace(/\$/g, '_dollar_')
    .replace(/\[/g, '_lb_')
    .replace(/\]/g, '_rb_')
    .replace(/\//g, '_slash_');
}

function desanitizeKey(k) {
  return k
    .replace(/_slash_/g, '/')
    .replace(/_rb_/g, ']')
    .replace(/_lb_/g, '[')
    .replace(/_dollar_/g, '$')
    .replace(/_hash_/g, '#')
    .replace(/_at_/g, '@')
    .replace(/_dot_/g, '.');
}

async function useFirebaseAuthState(clientId) {
  const FB_URL = `${FB_BASE}/wa-session-${clientId}`;
  let saveTimer = null;

  let stored = null;
  try {
    const res = await axios.get(FB_URL + '.json', { timeout: 15000 });
    stored = res.data || null;
  } catch (e) {
    console.warn(`[FB-Auth:${clientId}] Read error:`, e.message);
  }

  let creds;
  let keyStore = {};

  if (stored && stored.creds) {
    try {
      creds = JSON.parse(stored.creds, BufferJSON.reviver);
      const rawKeys = stored.keys || {};
      for (const [k, v] of Object.entries(rawKeys)) {
        keyStore[desanitizeKey(k)] = v;
      }
      console.log(`[FB-Auth:${clientId}] Session loaded from Firebase`);
    } catch (e) {
      console.warn(`[FB-Auth:${clientId}] Parse error, fresh session:`, e.message);
      creds = initAuthCreds();
    }
  } else {
    console.log(`[FB-Auth:${clientId}] No saved session — fresh start`);
    creds = initAuthCreds();
  }

  async function saveAll() {
    const slimKeys = {};
    for (const [k, v] of Object.entries(keyStore)) {
      if (!k.startsWith('session-')) slimKeys[sanitizeKey(k)] = v;
    }
    const data = {
      creds: JSON.stringify(creds, BufferJSON.replacer),
      keys: slimKeys,
      savedAt: new Date().toISOString(),
    };
    try {
      const payload = JSON.stringify(data);
      console.log(`[FB-Auth:${clientId}] Saving —`, Math.round(payload.length / 1024), 'KB');
      await axios.put(FB_URL + '.json', data, { timeout: 15000 });
      console.log(`[FB-Auth:${clientId}] Session saved`);
    } catch (e) {
      console.error(`[FB-Auth:${clientId}] Write error:`, e.message);
      if (e.response) console.error(`[FB-Auth:${clientId}] Firebase said:`, e.response.status, JSON.stringify(e.response.data).slice(0, 300));
    }
  }

  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveAll().catch(e => console.error(`[FB-Auth:${clientId}] Debounced save error:`, e.message));
    }, 2000);
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const raw = keyStore[`${type}-${id}`];
            if (raw) {
              try {
                let value = JSON.parse(raw, BufferJSON.reviver);
                if (type === 'app-state-sync-key') {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
              } catch (e) {}
            }
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                keyStore[key] = JSON.stringify(value, BufferJSON.replacer);
              } else {
                delete keyStore[key];
              }
            }
          }
          debouncedSave();
        },
      },
    },
    saveCreds: saveAll,
  };
}

module.exports = { useFirebaseAuthState };
