import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ConversationLog from '../components/ConversationLog.jsx';

export default function ClientDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getLogs(id)
      .then(res => setLogs(res.data.logs || []))
      .catch(err => console.error('getLogs error:', err))
      .finally(() => setLoading(false));
  }, [id]);

  const filtered = logs.filter(l => l.userPhone?.includes(search));

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      <nav style={{ background: '#1e293b', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#e2e8f0' }}>📋 Conversation Logs</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{logs.length} conversations</span>
          <button onClick={() => navigate('/')} style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
        </div>
      </nav>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search by phone number..."
          style={{ width: '100%', background: '#1e293b', border: '1.5px solid #334155', borderRadius: 10, padding: '11px 16px', fontSize: 14, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit', marginBottom: 18 }}
        />

        {loading && <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>Loading...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80, color: '#64748b', fontSize: 16 }}>
            📭 {search ? 'Koi result nahi' : 'Is client ka koi conversation nahi abhi tak'}
          </div>
        )}
        {filtered.map(log => <ConversationLog key={log.id} log={log} />)}
      </div>
    </div>
  );
}
