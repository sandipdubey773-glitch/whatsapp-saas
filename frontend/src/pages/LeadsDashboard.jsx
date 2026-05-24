import React, { useState, useEffect } from 'react';

const CLIENT_ID = 'a86e53ec-7971-47e3-9274-a0be32cae7ca';
const leadsApi = {
  getLeads: async (date) => {
    const r = await fetch(`/booking/leads?date=${date}&clientId=${CLIENT_ID}`);
    return r.json();
  },
  updateFeedback: async (leadId, feedback) => {
    const r = await fetch(`/booking/leads/${leadId}/feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback })
    });
    return r.json();
  }
};

function todayIST() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 330);
  return d.toISOString().split('T')[0];
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const ist = new Date(d.getTime() + 330 * 60000);
  return ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function LeadCard({ lead, onFeedback }) {
  const [showFb, setShowFb] = useState(false);
  const [fbText, setFbText] = useState(lead.feedback || '');

  const handleSave = async () => {
    await leadsApi.updateFeedback(lead.id, fbText);
    lead.feedback = fbText;
    setShowFb(false);
  };

  return (
    <div className="glass-card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '4px' }}>
            {lead.name || 'Unknown'}
          </h4>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{lead.phone || '-'}</span>
        </div>
        <span className={`badge ${lead.called ? 'badge-success' : 'badge-warning'}`}>
          {lead.called ? 'Called' : 'Pending'}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
        {lead.vehicle && <span>🏍️ {lead.vehicle}</span>}
        {lead.area && <span>📍 {lead.area}</span>}
        {lead.source && <span>📱 {lead.source}</span>}
        {lead.time && <span>🕐 {lead.time}</span>}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {!lead.called && (
          <button className="btn btn-success btn-sm" onClick={() => { window.open(`tel:${lead.phone}`); lead.called = true; }}>
            📞 Call
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => { setFbText(lead.feedback || ''); setShowFb(true); }}>
          {lead.feedback ? '✏️ Feedback' : '💬 Feedback'}
        </button>
      </div>

      {lead.feedback && (
        <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(99,102,241,0.08)', borderRadius: '8px', fontSize: '0.8rem', color: '#c7d2fe' }}>
          📝 {lead.feedback}
        </div>
      )}

      {showFb && (
        <div className="modal-overlay" onClick={() => setShowFb(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title" style={{ marginBottom: '16px' }}>Feedback — {lead.name}</h3>
            <textarea
              className="input"
              rows={4}
              value={fbText}
              onChange={e => setFbText(e.target.value)}
              placeholder="Feedback likhein..."
              style={{ resize: 'vertical', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowFb(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeadsDashboard({ onBack }) {
  const [date, setDate] = useState(todayIST());
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const data = await leadsApi.getLeads(date);
      setLeads(data.leads || []);
    } catch (e) { setLeads([]); }
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [date]);

  const total = leads.length;
  const pending = leads.filter(l => !l.called).length;
  const called = leads.filter(l => l.called).length;
  const feedbackGiven = leads.filter(l => l.feedback).length;

  return (
    <div style={{ minHeight: '100vh', background: '#080c16' }}>
      <header style={{
        background: 'rgba(17,24,39,0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1e293b',
        padding: '0 32px', height: '68px',
        display: 'flex', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
        <h2 style={{ marginLeft: '16px', fontSize: '1.1rem', fontWeight: '700', color: '#f1f5f9' }}>📊 Leads Dashboard</h2>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input"
            style={{ maxWidth: '200px' }}
          />
          <div className="grid-4" style={{ flex: 1 }}>
            <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f1f5f9' }}>{total}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total</div>
            </div>
            <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f59e0b' }}>{pending}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Pending</div>
            </div>
            <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#22c55e' }}>{called}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Called</div>
            </div>
            <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#818cf8' }}>{feedbackGiven}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Feedback</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid-2">{[1,2,3,4].map(i => <div key={i} className="glass-card" style={{ padding: '24px', height: '140px' }}><div className="skeleton" style={{ width: '60%', height: '20px' }} /></div>)}</div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-text">Is din koi lead nahi hai</div>
          </div>
        ) : (
          <div className="grid-2">
            {leads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
          </div>
        )}
      </main>
    </div>
  );
}
