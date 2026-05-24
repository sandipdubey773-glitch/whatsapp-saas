import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ClientCard from '../components/ClientCard';
import { api } from '../api';

export default function AdminDashboard({ onLogout }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchClients = async () => {
    try {
      const data = await api.getClients();
      setClients(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: clients.length,
    active: clients.filter(c => c.status === 'active' || c.active === true).length,
    waConnected: clients.filter(c => c.waStatus === 'open').length,
    pro: clients.filter(c => c.plan === 'pro').length
  };

  const handleToggle = async (id) => {
    await api.toggleClient(id);
    fetchClients();
  };

  const handleDelete = async (id) => {
    if (!confirm('delete karo?')) return;
    await api.deleteClient(id);
    fetchClients();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #080c16 0%, #0b0f1a 100%)'
    }}>
      {/* Header */}
      <header style={{
        background: 'rgba(17, 24, 39, 0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1e293b',
        padding: '0 32px',
        height: '68px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
          }}>🤖</div>
          <span style={{ fontWeight: '700', fontSize: '1.1rem', color: '#f1f5f9' }}>
            WhatsApp <span style={{ color: '#818cf8' }}>SaaS</span>
          </span>
          <div style={{
            padding: '3px 10px',
            borderRadius: '100px',
            background: 'rgba(99,102,241,0.15)',
            color: '#818cf8',
            fontSize: '0.7rem',
            fontWeight: '600',
            letterSpacing: '0.05em'
          }}>ADMIN</div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/leads')}>
            📊 Leads
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/add-client')}>
            ➕ Add Client
          </button>
          <button
            onClick={onLogout}
            style={{
              padding: '8px 16px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '8px',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.target.style.background = 'rgba(239,68,68,0.2)'}
            onMouseLeave={e => e.target.style.background = 'rgba(239,68,68,0.1)'}
          >
            Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f1f5f9', marginBottom: '4px' }}>
            Dashboard
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Manage all your WhatsApp bot clients from one place
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid-4" style={{ marginBottom: '32px' }}>
          {[
            { label: 'Total Clients', value: stats.total, icon: '👥', color: '#6366f1' },
            { label: 'Active', value: stats.active, icon: '🟢', color: '#22c55e' },
            { label: 'WhatsApp Connected', value: stats.waConnected, icon: '📱', color: '#06b6d4' },
            { label: 'Pro Plan', value: stats.pro, icon: '⭐', color: '#f59e0b' }
          ].map((stat, i) => (
            <div key={i} className="glass-card" style={{
              padding: '24px',
              animation: `fadeIn 0.3s ease ${i * 0.1}s forwards`,
              opacity: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '48px', height: '48px',
                  borderRadius: '14px',
                  background: `${stat.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem'
                }}>{stat.icon}</div>
                <div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f1f5f9', lineHeight: 1 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                    {stat.label}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '4px 4px 4px 18px'
        }}>
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients by name..."
            style={{
              flex: 1,
              padding: '12px 0',
              background: 'transparent',
              border: 'none',
              color: '#f1f5f9',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />
          {filtered.length > 0 && (
            <div style={{
              padding: '4px 12px',
              borderRadius: '100px',
              background: 'var(--bg-surface)',
              color: '#64748b',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}>{filtered.length} clients</div>
          )}
        </div>

        {/* Client List */}
        {loading ? (
          <div className="grid-2">
            {[1,2,3,4].map(i => (
              <div key={i} className="glass-card" style={{ padding: '24px', height: '200px' }}>
                <div className="skeleton" style={{ width: '60%', height: '20px', marginBottom: '16px' }} />
                <div className="skeleton" style={{ width: '40%', height: '14px', marginBottom: '12px' }} />
                <div className="skeleton" style={{ width: '80%', height: '14px', marginBottom: '12px' }} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>
              {search ? '🔍' : '📦'}
            </div>
            <h3 style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '8px' }}>
              {search ? 'Koi result nahi mila' : 'Koi client nahi hai'}
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '20px' }}>
              {search ? 'Different search term try karein' : 'Naya client add karne ke liye button par click karein'}
            </p>
          </div>
        ) : (
          <div className="grid-2">
            {filtered.map(client => (
              <ClientCard
                key={client.id}
                client={client}
                onToggle={() => handleToggle(client.id)}
                onDelete={() => handleDelete(client.id)}
                onLogs={() => navigate('/client/' + client.id + '/logs')}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
