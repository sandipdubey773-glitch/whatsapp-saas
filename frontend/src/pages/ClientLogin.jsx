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

export default function ClientLogin({ onLogin }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Clear any previously stored token when login page opens
  React.useEffect(() => {
    localStorage.removeItem('clientToken');
    localStorage.removeItem('clientName');
  }, []);

  const handleLogin = async () => {
    if (!form.username.trim() || !form.password.trim()) {
      setError('Username aur password daalein');
      return;
    }
    setLoading(true);
    setError('');
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
    } catch (e) {
      setError('Connection failed');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #080c16 0%, #0f1729 50%, #111827 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        width: '600px', height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
        top: '-200px', right: '-200px',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        width: '500px', height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
        bottom: '-150px', left: '-150px',
        pointerEvents: 'none'
      }} />

      <div style={{
        background: 'rgba(17,24,39,0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(30,41,59,0.8)',
        borderRadius: '24px',
        padding: '48px 40px',
        width: '420px',
        maxWidth: '92%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 1,
        animation: 'fadeIn 0.5s ease forwards'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '64px', height: '64px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(6,182,212,0.3)'
          }}>💬</div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: '800',
            background: 'linear-gradient(135deg, #f1f5f9, #94a3b8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '6px'
          }}>WaFlou</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Sign in to your dashboard
          </p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Username</label>
          <input
            className="input"
            value={form.username}
            onChange={e => { setForm({...form, username: e.target.value}); setError(''); }}
            placeholder="Your username"
          />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Password</label>
          <input
            type="password"
            className="input"
            value={form.password}
            onChange={e => { setForm({...form, password: e.target.value}); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Your password"
          />
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '16px', textAlign: 'center' }}>
            ⚠️ {error}
          </div>
        )}

        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In →'}
        </button>
      </div>

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}
