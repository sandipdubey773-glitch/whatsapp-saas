import React, { useState } from 'react';

export default function ConversationLog({ log }) {
  const [open, setOpen] = useState(false);
  const msgs = log.messages || [];
  const last = msgs[msgs.length - 1];
  const lastTs = last?.timestamp ? new Date(last.timestamp).toLocaleString('en-IN') : '—';

  return (
    <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', marginBottom: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: '13px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: open ? '#0f172a' : 'transparent' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>📱 {log.userPhone}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
            {msgs.length} messages · Last: {lastTs}
          </div>
        </div>
        <span style={{ color: '#475569', fontSize: 12 }}>{open ? '▲ Hide' : '▼ Show'}</span>
      </div>

      {/* Messages */}
      {open && (
        <div style={{ padding: '14px 18px', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 500, overflowY: 'auto' }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 8 }}>
              <div style={{ maxWidth: '78%' }}>
                <div style={{
                  padding: '9px 13px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: 13, lineHeight: 1.55,
                  background: m.role === 'user' ? '#1e3a5f' : '#1a2744',
                  color: m.role === 'user' ? '#93c5fd' : '#e2e8f0',
                  border: `1px solid ${m.role === 'user' ? '#1d4ed8' : '#334155'}`,
                }}>
                  {m.content}
                </div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 3, textAlign: m.role === 'user' ? 'right' : 'left' }}>
                  {m.role === 'user' ? '👤 User' : '🤖 Bot'} · {m.timestamp ? new Date(m.timestamp).toLocaleTimeString('en-IN') : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
