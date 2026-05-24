import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!token.trim()) { setError('Admin token daalein'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/admin/clients', {
        headers: { 'x-admin-token': token.trim() }
      });
      if (res.ok) {
        onLogin(token.trim());
      } else if (res.status === 401) {
        setError('Galat token — dubara check karein');
      } else {
        setError('Server error — baad mein try karein');
      }
    } catch (e) {
      setError('Connection failed — server on hai?' + (e.message ? ': ' + e.message : ''));
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleLogin(); };

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
      {/* Animated background orbs */}
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
        top: '-200px',
        right: '-200px',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
        bottom: '-150px',
        left: '-150px',
        pointerEvents: 'none'
      }} />

      <div style={{
        background: 'rgba(17, 24, 39, 0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(30, 41, 59, 0.8)',
        borderRadius: '24px',
        padding: '48px 40px',
        width: '420px',
        maxWidth: '92%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.05)',
        position: 'relative',
        zIndex: 1,
        animation: 'fadeIn 0.5s ease forwards'
      }}>
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.3)'
          }}>🤖</div>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #f1f5f9, #94a3b8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '6px'
          }}>WaFlou</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Admin Panel
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '0.8rem',
            fontWeight: '600',
            color: '#94a3b8',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>Admin Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="e.g., ShivangiSaaS@2026"
            style={{
              width: '100%',
              padding: '14px 18px',
              background: 'rgba(26, 34, 53, 0.8)',
              border: error ? '1px solid #ef4444' : '1px solid #2a3348',
              borderRadius: '12px',
              color: '#f1f5f9',
              fontSize: '0.9rem',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
          />
          {error && (
            <div style={{
              marginTop: '8px',
              fontSize: '0.8rem',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>⚠️</span> {error}
            </div>
          )}
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            background: loading
              ? 'linear-gradient(135deg, #4f46e5, #4338ca)'
              : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.3)',
            opacity: loading ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
          onMouseEnter={(e) => { if (!loading) e.target.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.target.style.transform = 'translateY(0)'; }}
        >
          {loading ? (
            <><span style={{
              width: '18px', height: '18px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: 'white',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
              display: 'inline-block'
            }} /> Verifying...</>
          ) : 'Sign In →'}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
