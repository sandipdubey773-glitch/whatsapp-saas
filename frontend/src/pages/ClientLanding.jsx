import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const clientApi = {
  login: async (username, password) => {
    const res = await fetch('/client/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return res.json();
  }
};

export default function ClientLanding({ onLogin }) {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    localStorage.removeItem('clientToken');
    localStorage.removeItem('clientName');
  }, []);

  const handleLogin = async () => {
    if (!form.username.trim() || !form.password.trim()) { setError('Username aur password daalein'); return; }
    setLoading(true); setError('');
    try {
      const data = await clientApi.login(form.username.trim(), form.password);
      if (data.clientToken) {
        localStorage.setItem('clientToken', data.clientToken);
        localStorage.setItem('clientName', data.name || form.username);
        onLogin();
        navigate('/client-portal');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (e) { setError('Connection failed'); }
    setLoading(false);
  };

  const features = [
    { icon: '🤖', title: 'AI WhatsApp Bot', desc: '24/7 automatic customer replies' },
    { icon: '📊', title: 'Smart Analytics', desc: 'Track conversations & leads' },
    { icon: '💬', title: 'Live Inbox', desc: 'Manually reply when needed' },
    { icon: '📋', title: 'Daily Reports', desc: 'Auto reports on WhatsApp' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #080c16 0%, #0f1729 50%, #111827 100%)', color: '#e2e8f0', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>

      {/* Nav */}
      <nav style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
          <span style={{ fontSize: 20, fontWeight: 800 }}>Wa<span style={{ color: '#818cf8' }}>Flow</span></span>
        </div>
        <button onClick={() => setShowLogin(true)} style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
          Client Login →
        </button>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '80px 24px 60px' }}>
        <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 99, padding: '6px 18px', fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 24, letterSpacing: 1 }}>
          POWERED BY AI
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20 }}>
          WhatsApp Bot <br />
          <span style={{ background: 'linear-gradient(135deg, #6366f1, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>for your Business</span>
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.7 }}>
          Apne customers se 24/7 baat karo — bina ek bhi message miss kiye. AI bot automatically respond karta hai.
        </p>
        <button onClick={() => setShowLogin(true)} style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: 12, padding: '14px 36px', fontSize: 16, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}>
          Dashboard Login →
        </button>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 80px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {features.map((f, i) => (
          <div key={i} style={{ background: 'rgba(17,24,39,0.8)', border: '1px solid rgba(30,41,59,0.8)', borderRadius: 16, padding: 24, backdropFilter: 'blur(12px)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', color: '#334155', fontSize: 12 }}>
        © 2026 WaFlow — WhatsApp Bot Platform
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div onClick={() => setShowLogin(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(17,24,39,0.98)', border: '1px solid rgba(30,41,59,0.8)', borderRadius: 24, padding: '40px 36px', width: 400, maxWidth: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #06b6d4, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px' }}>💬</div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>WaFlow</h2>
              <p style={{ color: '#64748b', fontSize: 13 }}>Sign in to your dashboard</p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Username</label>
              <input value={form.username} onChange={e => { setForm({ ...form, username: e.target.value }); setError(''); }}
                placeholder="Your username" style={{ width: '100%', background: 'rgba(26,34,53,0.8)', border: '1px solid #2a3348', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#f1f5f9', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Password</label>
              <input type="password" value={form.password} onChange={e => { setForm({ ...form, password: e.target.value }); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Your password" style={{ width: '100%', background: 'rgba(26,34,53,0.8)', border: '1px solid #2a3348', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#f1f5f9', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 14, textAlign: 'center' }}>⚠️ {error}</div>}

            <button onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: 13, background: loading ? '#4338ca' : 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
