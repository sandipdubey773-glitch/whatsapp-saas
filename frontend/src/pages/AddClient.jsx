import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import PromptEditor from '../components/PromptEditor.jsx';

const PERM_LIST = [
  { key: 'viewStats',         label: 'Stats dekhna',           desc: 'Total conversations, messages' },
  { key: 'viewLogs',          label: 'Conversations dekhna',   desc: 'Customer chat logs' },
  { key: 'toggleBot',         label: 'Bot ON/OFF karna',       desc: 'Bot start/stop kare' },
  { key: 'sendReport',        label: 'Report bhejana',         desc: 'Manual WhatsApp report' },
  { key: 'viewReportPreview', label: 'Report preview dekhna',  desc: 'Report text dekh sake' },
  { key: 'editPrompt',        label: 'System Prompt edit karna', desc: 'Bot ka prompt change kare' },
];

const blank = { name: '', aiProvider: 'gemini', aiKey: '', systemPrompt: '', plan: 'starter', googleSheetWebhook: '', reportPhone: '', ownerPhone: '', leadGroup: '', metaPhoneNumberId: '', metaAccessToken: '', metaVerifyToken: '', clientUsername: '', clientPassword: '', permissions: {}, businessHoursEnabled: false, businessHoursStart: '09:00', businessHoursEnd: '20:00', businessClosedMessage: 'Humari shop abhi band hai. Hum kal subah open hote hi aapko reply karenge.', typingDelayEnabled: false };
const inp = { width: '100%', background: '#0f172a', border: '1.5px solid #334155', borderRadius: 9, padding: '11px 13px', fontSize: 14, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit' };
const sel = { ...inp, appearance: 'none', cursor: 'pointer' };
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 };
const card = { background: '#1e293b', borderRadius: 14, padding: 24, border: '1px solid #334155', marginBottom: 18 };

export default function AddClient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm]     = useState(blank);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const isEdit = !!id;

  useEffect(() => {
    if (!isEdit) return;
    api.getClients().then(res => {
      const c = res.data.clients.find(c => c.id === id);
      if (c) setForm({ name: c.name || '', aiProvider: c.aiProvider || 'gemini', aiKey: c.aiKey || '', systemPrompt: c.systemPrompt || '', plan: c.plan || 'starter', googleSheetWebhook: c.googleSheetWebhook || '', reportPhone: c.reportPhone || '', ownerPhone: c.ownerPhone || '', leadGroup: c.leadGroup || '', metaPhoneNumberId: c.metaPhoneNumberId || '', metaAccessToken: c.metaAccessToken || '', metaVerifyToken: c.metaVerifyToken || '', clientUsername: c.clientUsername || '', clientPassword: c.clientPassword || '', permissions: c.permissions || {}, businessHoursEnabled: c.businessHoursEnabled || false, businessHoursStart: c.businessHoursStart || '09:00', businessHoursEnd: c.businessHoursEnd || '20:00', businessClosedMessage: c.businessClosedMessage || 'Humari shop abhi band hai. Hum kal subah open hote hi aapko reply karenge.', typingDelayEnabled: c.typingDelayEnabled || false });
    }).catch(console.error);
  }, [id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const togglePerm = (key) => setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));

  const handleSave = async () => {
    if (!form.name || !form.aiKey || !form.systemPrompt) {
      setError('⚠️ Name, AI Key aur System Prompt required hain'); return;
    }
    setLoading(true); setError('');
    try {
      isEdit ? await api.updateClient(id, form) : await api.addClient(form);
      navigate('/');
    } catch (err) {
      setError('❌ ' + (err.response?.data?.error || err.message));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', paddingBottom: 60 }}>
      <nav style={{ background: '#1e293b', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', marginBottom: 28 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#e2e8f0' }}>{isEdit ? '✏️ Edit Client' : '➕ New Client'}</div>
        <button onClick={() => navigate('/')} style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
      </nav>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>

        {/* Basic */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 18 }}>📋 Client Info</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><label style={lbl}>Client / Business Name *</label><input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Sharma Motors" /></div>
            <div><label style={lbl}>Plan</label>
              <select style={sel} value={form.plan} onChange={e => set('plan', e.target.value)}>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
              </select>
            </div>
          </div>
        </div>

        {/* AI */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 18 }}>🤖 AI Config</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div><label style={lbl}>AI Provider *</label>
              <select style={sel} value={form.aiProvider} onChange={e => set('aiProvider', e.target.value)}>
                <option value="claude">Claude (Sabse Smart ⭐)</option>
                <option value="gemini">Gemini (Free)</option>
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
            <div><label style={lbl}>API Key *</label><input style={inp} type="password" value={form.aiKey} onChange={e => set('aiKey', e.target.value)} placeholder="AIzaSy... / sk-..." /></div>
          </div>
        </div>

        {/* Meta Business API */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>📡 WhatsApp — Meta Business API</div>

          {/* Step-by-step links */}
          <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa', marginBottom: 8 }}>🔗 Setup ke liye yahan click karo (step by step):</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#34d399', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>1️⃣</span> <span style={{ textDecoration: 'underline' }}>Meta App banao → developers.facebook.com/apps</span>
              </a>
              <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#34d399', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>2️⃣</span> <span style={{ textDecoration: 'underline' }}>Permanent Token banao → Business Manager → System Users</span>
              </a>
              <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>3️⃣</span>
                <span>Webhook URL copy karo → </span>
                <code style={{ background: '#1e293b', padding: '1px 6px', borderRadius: 4, color: '#60a5fa', fontSize: 11 }}>
                  https://shivangi-saas-bot.onrender.com/meta/webhook
                </code>
              </div>
              <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#f59e0b', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📖</span> <span style={{ textDecoration: 'underline' }}>Meta Official Guide (agar confuse ho)</span>
              </a>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Phone Number ID *</label>
              <input style={inp} value={form.metaPhoneNumberId} onChange={e => set('metaPhoneNumberId', e.target.value)} placeholder="123456789012345" />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>App → WhatsApp → Getting Started pe milega</div>
            </div>
            <div>
              <label style={lbl}>Permanent Access Token *</label>
              <input style={inp} type="password" value={form.metaAccessToken} onChange={e => set('metaAccessToken', e.target.value)} placeholder="EAAxxxxxxx..." />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>System User se generate karo (never expires)</div>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Webhook Verify Token *</label>
            <input style={inp} value={form.metaVerifyToken} onChange={e => set('metaVerifyToken', e.target.value)} placeholder="shivangi_verify_2026" />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>Koi bhi secret string — Meta webhook setup mein yahi daalo</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={lbl}>Owner WhatsApp Number</label>
              <input style={inp} value={form.ownerPhone} onChange={e => set('ownerPhone', e.target.value)} placeholder="9327363931" />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>Owner ko bot se seedha baat karne ki permission</div>
            </div>
            <div>
              <label style={lbl}>Report WhatsApp Number (Lead Group)</label>
              <input style={inp} value={form.leadGroup} onChange={e => set('leadGroup', e.target.value)} placeholder="9327363931" />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>Leads aur reports is number pe jayenge</div>
            </div>
          </div>
        </div>

        {/* Business Hours & Bot Behavior */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 18 }}>🕒 Business Hours & Bot Behavior</div>
          
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Business Hours Enable</label>
              <div onClick={() => set('businessHoursEnabled', !form.businessHoursEnabled)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div style={{ width: 44, height: 24, borderRadius: 12, background: form.businessHoursEnabled ? '#25d366' : '#334155', position: 'relative', transition: 'background 0.15s' }}>
                  <div style={{ position: 'absolute', top: 3, left: form.businessHoursEnabled ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.15s' }} />
                </div>
                <span style={{ fontSize: 13, color: '#e2e8f0' }}>{form.businessHoursEnabled ? 'ON' : 'OFF'}</span>
              </div>
            </div>
            
            <div style={{ flex: 1 }}>
              <label style={lbl}>Typing Delay (Human Feel)</label>
              <div onClick={() => set('typingDelayEnabled', !form.typingDelayEnabled)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div style={{ width: 44, height: 24, borderRadius: 12, background: form.typingDelayEnabled ? '#25d366' : '#334155', position: 'relative', transition: 'background 0.15s' }}>
                  <div style={{ position: 'absolute', top: 3, left: form.typingDelayEnabled ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.15s' }} />
                </div>
                <span style={{ fontSize: 13, color: '#e2e8f0' }}>{form.typingDelayEnabled ? 'ON (2 sec delay)' : 'OFF (Instant)'}</span>
              </div>
            </div>
          </div>

          {form.businessHoursEnabled && (
            <div style={{ background: '#0f172a', padding: 16, borderRadius: 8, border: '1px solid #1e3a5f' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                <div><label style={lbl}>Start Time</label><input type="time" style={inp} value={form.businessHoursStart} onChange={e => set('businessHoursStart', e.target.value)} /></div>
                <div><label style={lbl}>End Time</label><input type="time" style={inp} value={form.businessHoursEnd} onChange={e => set('businessHoursEnd', e.target.value)} /></div>
              </div>
              <div>
                <label style={lbl}>Closed Message (Customer ko kya bhejna hai?)</label>
                <textarea style={{ ...inp, minHeight: 60 }} value={form.businessClosedMessage} onChange={e => set('businessClosedMessage', e.target.value)} />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>Band hone ke baad message aane par ye 1 baar jayega (AI band rahega)</div>
              </div>
            </div>
          )}
        </div>

        {/* Report + Sheet */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 18 }}>📊 Report & Google Sheet</div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Report WhatsApp Number (Owner ko)</label>
            <input style={inp} value={form.reportPhone} onChange={e => set('reportPhone', e.target.value)} placeholder="919876543210 (country code ke saath, no +)" />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>Roz raat 9 baje daily report is number pe aayegi</div>
          </div>

          <div>
            <label style={lbl}>Google Sheet Webhook URL (Optional)</label>
            <input style={inp} value={form.googleSheetWebhook} onChange={e => set('googleSheetWebhook', e.target.value)} placeholder="https://script.google.com/macros/s/xxx/exec" />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>Har conversation ka data automatically sheet mein save hoga</div>
          </div>
        </div>

        {/* System Prompt */}
        <div style={card}>
          <PromptEditor value={form.systemPrompt} onChange={v => set('systemPrompt', v)} />
        </div>

        {/* Client Login Credentials */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 18 }}>🔐 Client Login Credentials</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Client in apne dashboard pe login karne ke liye ye use karega</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><label style={lbl}>Username</label><input style={inp} value={form.clientUsername} onChange={e => set('clientUsername', e.target.value)} placeholder="sharma_motors" /></div>
            <div><label style={lbl}>Password</label><input style={inp} type="password" value={form.clientPassword} onChange={e => set('clientPassword', e.target.value)} placeholder="••••••••" /></div>
          </div>
        </div>

        {/* Permissions */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>🛡️ Client Permissions</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>Jo ON karoge, client uska access paega apne dashboard mein</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PERM_LIST.map(p => (
              <div key={p.key} onClick={() => togglePerm(p.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: form.permissions[p.key] ? '#0f2d1f' : '#0f172a', border: `1.5px solid ${form.permissions[p.key] ? '#25d366' : '#334155'}`, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', transition: 'all 0.15s' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.permissions[p.key] ? '#25d366' : '#94a3b8' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{p.desc}</div>
                </div>
                <div style={{ width: 44, height: 24, borderRadius: 12, background: form.permissions[p.key] ? '#25d366' : '#334155', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: form.permissions[p.key] ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.15s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 14, background: '#450a0a', padding: '10px 14px', borderRadius: 8, border: '1px solid #7f1d1d' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={loading} style={{ flex: 1, background: loading ? '#1a4731' : '#25d366', border: 'none', borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {loading ? 'Saving...' : isEdit ? '✅ Update Client' : '✅ Add Client'}
          </button>
          <button onClick={() => navigate('/')} style={{ background: '#334155', border: 'none', borderRadius: 10, padding: '13px 22px', fontSize: 14, fontWeight: 700, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
