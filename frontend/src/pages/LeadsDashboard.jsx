import React, { useState, useEffect } from 'react';

const CLIENT_ID = 'a86e53ec-7971-47e3-9274-a0be32cae7ca';

const leadsApi = {
  getLeads: async (date) => {
    const r = await fetch(`/booking/leads?date=${date}&clientId=${CLIENT_ID}`);
    return r.json();
  },
  markCalled: async (leadId) => {
    await fetch(`/booking/leads/${leadId}/call`, { method: 'POST' });
  },
  exotelCall: async (leadId, staffPhone) => {
    const r = await fetch(`/booking/leads/${leadId}/exotel-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffPhone, clientId: CLIENT_ID }),
    });
    return r.json();
  },
  submitFeedback: async (leadId, text) => {
    const r = await fetch(`/booking/leads/${leadId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return r.json();
  },
};

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function LeadCard({ lead, staffPhone, onUpdate }) {
  const [calling, setCalling]   = useState(false);
  const [called, setCalled]     = useState(lead.called || false);
  const [showFb, setShowFb]     = useState(false);
  const [fbText, setFbText]     = useState(lead.feedback || '');
  const [saving, setSaving]     = useState(false);
  const [callMsg, setCallMsg]   = useState('');

  const handleCall = async () => {
    if (!staffPhone.trim()) {
      setCallMsg('⚠️ Pehle upar apna number daalo');
      setTimeout(() => setCallMsg(''), 3000);
      return;
    }
    setCalling(true);
    setCallMsg('');
    try {
      const res = await leadsApi.exotelCall(lead.id, staffPhone);
      if (res.success) {
        setCalled(true);
        setCallMsg('✅ Call connect ho rahi hai — apna phone check karo!');
      } else {
        // Fallback: direct call via tel:
        window.open(`tel:${lead.mobile}`);
        await leadsApi.markCalled(lead.id);
        setCalled(true);
        setCallMsg('📞 Direct call kiya (Exotel nahi mila)');
      }
    } catch {
      window.open(`tel:${lead.mobile}`);
      await leadsApi.markCalled(lead.id);
      setCalled(true);
    }
    setCalling(false);
    setTimeout(() => setCallMsg(''), 4000);
  };

  const handleFeedbackSave = async () => {
    if (!fbText.trim()) return;
    setSaving(true);
    await leadsApi.submitFeedback(lead.id, fbText);
    lead.feedback = fbText;
    setSaving(false);
    setShowFb(false);
    onUpdate?.();
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: 14, padding: 20, border: `1.5px solid ${called ? '#1a4731' : '#334155'}`, marginBottom: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{lead.naam || 'Unknown'}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{lead.mobile || '—'}</div>
        </div>
        <span style={{ background: called ? '#14532d' : '#451a03', color: called ? '#4ade80' : '#fbbf24', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
          {called ? '✅ Called' : '⏳ Pending'}
        </span>
      </div>

      {/* Details */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, fontSize: 12, color: '#94a3b8' }}>
        {lead.vehicle && <span>🏍️ {lead.vehicle}</span>}
        {lead.area    && <span>📍 {lead.area}</span>}
        {lead.assignedDate && <span>📅 {lead.assignedDate}</span>}
        {lead.source  && <span>📱 {lead.source}</span>}
      </div>

      {/* Feedback preview */}
      {lead.feedback && (
        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid #4f46e5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#c7d2fe' }}>
          💬 {lead.feedback}
        </div>
      )}

      {/* Call status message */}
      {callMsg && <div style={{ fontSize: 12, color: '#34d399', marginBottom: 8 }}>{callMsg}</div>}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleCall}
          disabled={calling}
          style={{
            flex: 1, background: called ? '#14532d' : '#16a34a', border: 'none', borderRadius: 9,
            padding: '10px 0', fontSize: 13, fontWeight: 700, color: '#fff',
            cursor: calling ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: calling ? 0.7 : 1, transition: 'all 0.15s',
          }}
        >
          {calling ? '⏳ Connecting...' : called ? '📞 Call Again' : '📞 Call Karo'}
        </button>

        <button
          onClick={() => { setFbText(lead.feedback || ''); setShowFb(true); }}
          style={{
            flex: 1, background: '#92400e', border: 'none', borderRadius: 9,
            padding: '10px 0', fontSize: 13, fontWeight: 700, color: '#fff',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          {lead.feedback ? '✏️ Edit Feedback' : '🟠 Feedback Do'}
        </button>
      </div>

      {/* Feedback Modal */}
      {showFb && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowFb(false)}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 28, width: '90%', maxWidth: 420, border: '1px solid #334155' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Feedback — {lead.naam}</div>
            <textarea
              rows={4}
              value={fbText}
              onChange={e => setFbText(e.target.value)}
              placeholder="Feedback likhein... (jaise: Interested hai, kal callback maanga, nahi uthaya)"
              style={{ width: '100%', background: '#0f172a', border: '1.5px solid #334155', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowFb(false)} style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleFeedbackSave} disabled={saving} style={{ background: '#ea580c', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : '✅ Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeadsDashboard({ onBack }) {
  const [date, setDate]         = useState(todayIST());
  const [leads, setLeads]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [staffPhone, setStaffPhone] = useState(() => localStorage.getItem('staffPhone') || '');

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const data = await leadsApi.getLeads(date);
      setLeads(data.leads || []);
    } catch { setLeads([]); }
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [date]);

  const saveStaffPhone = (v) => {
    setStaffPhone(v);
    localStorage.setItem('staffPhone', v);
  };

  const total       = leads.length;
  const pending     = leads.filter(l => !l.called).length;
  const called      = leads.filter(l => l.called).length;
  const feedbackGiven = leads.filter(l => l.feedback).length;

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', paddingBottom: 60 }}>
      {/* Header */}
      <nav style={{ background: '#1e293b', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={onBack} style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>📊 Leads Dashboard</div>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

        {/* Staff Phone + Exotel Info */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px 20px', border: '1.5px solid #334155', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Aapka Phone Number (Staff)</div>
            <input
              style={{ width: '100%', background: '#0f172a', border: '1.5px solid #334155', borderRadius: 8, padding: '9px 12px', fontSize: 14, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              value={staffPhone}
              onChange={e => saveStaffPhone(e.target.value)}
              placeholder="919876543210"
            />
          </div>
          <div style={{ fontSize: 12, color: '#64748b', maxWidth: 280 }}>
            📞 Exotel: Aapko call aayegi pehle → phir customer se connect → customer ko sirf virtual number dikhega
          </div>
        </div>

        {/* Date + Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: '#1e293b', border: '1.5px solid #334155', borderRadius: 8, padding: '9px 12px', fontSize: 14, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
            {[
              { label: 'Total', val: total, color: '#e2e8f0' },
              { label: 'Pending', val: pending, color: '#fbbf24' },
              { label: 'Called', val: called, color: '#4ade80' },
              { label: 'Feedback', val: feedbackGiven, color: '#818cf8' },
            ].map(s => (
              <div key={s.label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Lead Cards */}
        {loading ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Loading...</div>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div>Is din koi lead nahi hai</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {leads.map(lead => (
              <LeadCard key={lead.id} lead={lead} staffPhone={staffPhone} onUpdate={fetchLeads} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
